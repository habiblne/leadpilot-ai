'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function request(body, ip = '203.0.113.10') {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body,
    socket: {},
  };
}

function response() {
  const headers = {};
  let body = '';
  return {
    statusCode: 200,
    setHeader(name, value) { headers[name] = value; },
    end(value) { body = value; },
    get headers() { return headers; },
    get json() { return JSON.parse(body); },
  };
}

function payload(requestId) {
  return {
    name: 'Ahmed Benali',
    phone: '+213 550 123 456',
    business: 'Benali Fashion',
    service: 'Lead qualification automation',
    budget: '120,000 DZD',
    message: 'We want to launch within the next seven days.',
    website: '',
    requestId,
    formStartedAt: Date.now() - 5_000,
  };
}

test('replays a successful request ID without a second upstream call', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_WEBHOOK_URL;
  const originalSecret = process.env.N8N_WEBHOOK_SECRET;
  const handler = require('../api/qualify');
  let calls = 0;
  let forwardedHeaders;

  process.env.N8N_WEBHOOK_URL = 'https://example.test/webhook';
  process.env.N8N_WEBHOOK_SECRET = 'test-secret-that-is-at-least-32-characters';
  global.fetch = async (_url, options) => {
    calls += 1;
    forwardedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          qualification: {
            score: 9,
            temperature: 'hot',
            purchaseIntent: 'high',
            urgency: 'high',
            budgetFit: 'strong',
          },
        };
      },
    };
  };

  try {
    const requestId = `test-${Date.now()}-duplicate`;
    const firstResponse = response();
    const secondResponse = response();
    await handler(request(payload(requestId)), firstResponse);
    await handler(request(payload(requestId)), secondResponse);

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(secondResponse.statusCode, 200);
    assert.equal(secondResponse.headers['Idempotency-Replayed'], 'true');
    assert.equal(secondResponse.json.requestId, requestId);
    assert.equal(calls, 1);
    assert.equal(forwardedHeaders['X-LeadPilot-Secret'], process.env.N8N_WEBHOOK_SECRET);
    assert.equal(forwardedHeaders['X-LeadPilot-Request-Id'], requestId);
  } finally {
    global.fetch = originalFetch;
    if (typeof originalUrl === 'undefined') delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = originalUrl;
    if (typeof originalSecret === 'undefined') delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = originalSecret;
  }
});

test('fails closed without a configured shared secret', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_WEBHOOK_URL;
  const originalSecret = process.env.N8N_WEBHOOK_SECRET;
  const handler = require('../api/qualify');
  let calls = 0;

  process.env.N8N_WEBHOOK_URL = 'https://example.test/webhook';
  delete process.env.N8N_WEBHOOK_SECRET;
  global.fetch = async () => { calls += 1; };

  try {
    const result = response();
    await handler(request(payload(`test-${Date.now()}-no-secret`)), result);
    assert.equal(result.statusCode, 503);
    assert.equal(result.json.error.code, 'SERVICE_NOT_CONFIGURED');
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
    if (typeof originalUrl === 'undefined') delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = originalUrl;
    if (typeof originalSecret === 'undefined') delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = originalSecret;
  }
});

test('maps n8n authentication failures to a safe public error', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_WEBHOOK_URL;
  const originalSecret = process.env.N8N_WEBHOOK_SECRET;
  const handler = require('../api/qualify');

  process.env.N8N_WEBHOOK_URL = 'https://example.test/webhook';
  process.env.N8N_WEBHOOK_SECRET = 'test-secret-that-is-at-least-32-characters';
  global.fetch = async () => ({ ok: false, status: 403 });

  try {
    const result = response();
    await handler(request(payload(`test-${Date.now()}-wrong-secret`)), result);
    assert.equal(result.statusCode, 502);
    assert.equal(result.json.error.code, 'UPSTREAM_AUTH_FAILED');
    assert.equal(result.json.error.message, 'Lead qualification is temporarily unavailable. Please try again.');
    assert.equal(JSON.stringify(result.json).includes(process.env.N8N_WEBHOOK_SECRET), false);
  } finally {
    global.fetch = originalFetch;
    if (typeof originalUrl === 'undefined') delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = originalUrl;
    if (typeof originalSecret === 'undefined') delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = originalSecret;
  }
});

test('maps upstream failure modes to stable public errors', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_WEBHOOK_URL;
  const originalSecret = process.env.N8N_WEBHOOK_SECRET;
  const handler = require('../api/qualify');
  process.env.N8N_WEBHOOK_URL = 'https://example.test/webhook';
  process.env.N8N_WEBHOOK_SECRET = 'test-secret-that-is-at-least-32-characters';

  const abortError = new Error('internal timeout detail');
  abortError.name = 'AbortError';
  const cases = [
    {
      name: 'invalid JSON',
      fetch: async () => ({ ok: true, status: 200, async json() { throw new Error('bad json'); } }),
      status: 502,
      code: 'INVALID_UPSTREAM_RESPONSE',
    },
    {
      name: 'invalid schema',
      fetch: async () => ({ ok: true, status: 200, async json() { return { qualification: { score: 99 } }; } }),
      status: 502,
      code: 'INVALID_UPSTREAM_RESPONSE',
    },
    {
      name: 'mismatched request ID',
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            requestId: '123e4567-e89b-12d3-a456-426614174000',
            qualification: {
              score: 9,
              temperature: 'hot',
              purchaseIntent: 'high',
              urgency: 'high',
              budgetFit: 'strong',
            },
          };
        },
      }),
      status: 502,
      code: 'INVALID_UPSTREAM_RESPONSE',
    },
    {
      name: 'HTTP 5xx',
      fetch: async () => ({ ok: false, status: 500 }),
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
    },
    {
      name: 'network error',
      fetch: async () => { throw new Error('private network detail'); },
      status: 502,
      code: 'UPSTREAM_NETWORK_ERROR',
    },
    {
      name: 'timeout',
      fetch: async () => { throw abortError; },
      status: 504,
      code: 'UPSTREAM_TIMEOUT',
    },
  ];

  try {
    for (const [index, failure] of cases.entries()) {
      global.fetch = failure.fetch;
      const result = response();
      await handler(
        request(payload(`test-${Date.now()}-${index}-failure`), `203.0.113.${20 + index}`),
        result,
      );
      assert.equal(result.statusCode, failure.status, failure.name);
      assert.equal(result.json.error.code, failure.code, failure.name);
      assert.equal(JSON.stringify(result.json).includes('detail'), false, failure.name);
    }
  } finally {
    global.fetch = originalFetch;
    if (typeof originalUrl === 'undefined') delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = originalUrl;
    if (typeof originalSecret === 'undefined') delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = originalSecret;
  }
});

test('rate limits excessive valid requests per function instance', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_WEBHOOK_URL;
  const originalSecret = process.env.N8N_WEBHOOK_SECRET;
  const handler = require('../api/qualify');
  process.env.N8N_WEBHOOK_URL = 'https://example.test/webhook';
  process.env.N8N_WEBHOOK_SECRET = 'test-secret-that-is-at-least-32-characters';
  global.fetch = async () => ({ ok: false, status: 500 });

  try {
    let result;
    for (let index = 0; index < 9; index += 1) {
      result = response();
      await handler(
        request(payload(`test-${Date.now()}-${index}-rate`), '198.51.100.25'),
        result,
      );
    }
    assert.equal(result.statusCode, 429);
    assert.equal(result.json.error.code, 'RATE_LIMITED');
    assert.equal(result.headers['Retry-After'] !== undefined, true);
  } finally {
    global.fetch = originalFetch;
    if (typeof originalUrl === 'undefined') delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = originalUrl;
    if (typeof originalSecret === 'undefined') delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = originalSecret;
  }
});
