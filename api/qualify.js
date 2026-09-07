'use strict';

const { MAX_BODY_BYTES, validateLeadPayload } = require('../lib/input-validation');
const { inspectN8nConfig } = require('../lib/server-config');
const { normalizeQualificationResponse } = require('../shared/qualification');

const UPSTREAM_TIMEOUT_MS = 20_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8;
const IDEMPOTENCY_TTL_MS = 10 * 60_000;
const rateLimitBuckets = globalThis.__leadPilotRateLimitBuckets || new Map();
const idempotencyCache = globalThis.__leadPilotIdempotencyCache || new Map();
globalThis.__leadPilotRateLimitBuckets = rateLimitBuckets;
globalThis.__leadPilotIdempotencyCache = idempotencyCache;

function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function errorBody(code, message, requestId = '') {
  return { success: false, requestId, error: { code, message } };
}

function parseBody(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return { ok: false, status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json.' };
  }

  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large.' };
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (Buffer.byteLength(JSON.stringify(body || null), 'utf8') > MAX_BODY_BYTES) {
      return { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large.' };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, status: 400, code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' };
  }
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(key, now = Date.now()) {
  for (const [bucketKey, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(bucketKey);
  }

  const existing = rateLimitBuckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    : existing;
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return {
    allowed: bucket.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - bucket.count),
    resetSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function cleanCaches(now = Date.now()) {
  for (const [requestId, entry] of idempotencyCache) {
    if (entry.expiresAt <= now) idempotencyCache.delete(requestId);
  }
}

function logEvent({ requestId, startedAt, upstreamStatus = null, success, code }) {
  console.log(JSON.stringify({
    service: 'leadpilot-qualify',
    requestId,
    timestamp: new Date().toISOString(),
    upstreamStatus,
    durationMs: Date.now() - startedAt,
    success,
    code,
  }));
}

async function callN8n(lead, requestId, startedAt) {
  const config = inspectN8nConfig();
  if (!config.ready) {
    const result = {
      status: 503,
      body: errorBody('SERVICE_NOT_CONFIGURED', 'Lead qualification is temporarily unavailable. Please try again later.', requestId),
      upstreamStatus: null,
    };
    logEvent({ requestId, startedAt, success: false, code: 'SERVICE_NOT_CONFIGURED' });
    return result;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstreamStatus = null;

  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-LeadPilot-Request-Id': requestId,
      'X-LeadPilot-Secret': config.value.webhookSecret,
    };

    const upstream = await fetch(config.value.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(lead),
      signal: controller.signal,
    });
    upstreamStatus = upstream.status;

    if (!upstream.ok) {
      const authenticationFailed = upstream.status === 401 || upstream.status === 403;
      const code = authenticationFailed
        ? 'UPSTREAM_AUTH_FAILED'
        : upstream.status >= 500
          ? 'UPSTREAM_UNAVAILABLE'
          : 'UPSTREAM_REJECTED';
      const status = upstream.status >= 500 ? 503 : 502;
      logEvent({ requestId, startedAt, upstreamStatus, success: false, code });
      return {
        status,
        body: errorBody(code, 'Lead qualification is temporarily unavailable. Please try again.', requestId),
        upstreamStatus,
      };
    }

    let upstreamBody;
    try {
      upstreamBody = await upstream.json();
    } catch {
      logEvent({ requestId, startedAt, upstreamStatus, success: false, code: 'INVALID_UPSTREAM_JSON' });
      return {
        status: 502,
        body: errorBody('INVALID_UPSTREAM_RESPONSE', 'Lead qualification returned an invalid response. Please try again.', requestId),
        upstreamStatus,
      };
    }

    try {
      const normalized = normalizeQualificationResponse(upstreamBody);
      if (normalized.requestId && normalized.requestId !== requestId) {
        throw new Error('Mismatched request ID');
      }
      const body = {
        ...normalized,
        requestId,
        message: normalized.message || 'Lead qualified successfully.',
      };
      logEvent({ requestId, startedAt, upstreamStatus, success: true, code: 'OK' });
      return { status: 200, body, upstreamStatus };
    } catch {
      logEvent({ requestId, startedAt, upstreamStatus, success: false, code: 'INVALID_UPSTREAM_SCHEMA' });
      return {
        status: 502,
        body: errorBody('INVALID_UPSTREAM_RESPONSE', 'Lead qualification returned an invalid response. Please try again.', requestId),
        upstreamStatus,
      };
    }
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    const code = timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR';
    logEvent({ requestId, startedAt, upstreamStatus, success: false, code });
    return {
      status: timedOut ? 504 : 502,
      body: errorBody(code, 'Lead qualification is temporarily unavailable. Please try again.', requestId),
      upstreamStatus,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function qualify(req, res) {
  const startedAt = Date.now();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, errorBody('METHOD_NOT_ALLOWED', 'Only POST requests are accepted.'));
  }

  const parsed = parseBody(req);
  if (!parsed.ok) return json(res, parsed.status, errorBody(parsed.code, parsed.message));

  const validated = validateLeadPayload(parsed.body, startedAt);
  const suppliedRequestId = typeof parsed.body?.requestId === 'string' ? parsed.body.requestId.trim() : '';
  if (!validated.ok) {
    const code = validated.error.field === 'website' ? 'SUBMISSION_REJECTED' : 'VALIDATION_ERROR';
    logEvent({ requestId: suppliedRequestId, startedAt, success: false, code });
    return json(res, 400, errorBody(code, validated.error.message, suppliedRequestId));
  }

  const { requestId } = validated.value;
  cleanCaches(startedAt);
  const cached = idempotencyCache.get(requestId);
  if (cached) {
    const replay = await cached.promise;
    logEvent({
      requestId,
      startedAt,
      upstreamStatus: replay.upstreamStatus,
      success: replay.status === 200,
      code: 'IDEMPOTENCY_REPLAY',
    });
    return json(res, replay.status, replay.body, { 'Idempotency-Replayed': 'true' });
  }

  const limit = checkRateLimit(clientIp(req), startedAt);
  const rateHeaders = {
    'RateLimit-Limit': String(RATE_LIMIT_MAX),
    'RateLimit-Remaining': String(limit.remaining),
    'RateLimit-Reset': String(limit.resetSeconds),
  };
  if (!limit.allowed) {
    logEvent({ requestId, startedAt, success: false, code: 'RATE_LIMITED' });
    return json(res, 429, errorBody('RATE_LIMITED', 'Too many submissions. Please wait a minute and try again.', requestId), {
      ...rateHeaders,
      'Retry-After': String(limit.resetSeconds),
    });
  }

  const upstreamPromise = callN8n(validated.value, requestId, startedAt);
  const entry = { promise: upstreamPromise, expiresAt: startedAt + IDEMPOTENCY_TTL_MS };
  idempotencyCache.set(requestId, entry);
  const result = await upstreamPromise;
  if (result.status !== 200) idempotencyCache.delete(requestId);

  return json(res, result.status, result.body, rateHeaders);
};
