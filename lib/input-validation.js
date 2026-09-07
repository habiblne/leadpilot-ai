'use strict';

const MAX_BODY_BYTES = 16 * 1024;
const MIN_COMPLETION_MS = 1_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const FIELD_RULES = {
  name: { required: true, min: 2, max: 100, collapseWhitespace: true },
  phone: { required: true, min: 6, max: 40, collapseWhitespace: true },
  business: { required: true, min: 2, max: 160, collapseWhitespace: true },
  service: { required: true, min: 2, max: 160, collapseWhitespace: true },
  budget: { required: false, min: 0, max: 100, collapseWhitespace: true },
  message: { required: true, min: 10, max: 3_000, collapseWhitespace: false },
};

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function containsForbiddenKey(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return false;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key) || containsForbiddenKey(value[key], depth + 1)) return true;
  }
  return false;
}

function normalizeString(value, collapseWhitespace) {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  return collapseWhitespace ? normalized.replace(/\s+/g, ' ') : normalized;
}

function validationError(field, message) {
  return { ok: false, error: { field, message } };
}

function validateLeadPayload(payload, now = Date.now()) {
  if (!isPlainRecord(payload) || containsForbiddenKey(payload)) {
    return validationError('payload', 'Request body must be a plain JSON object.');
  }

  if (typeof payload.website !== 'undefined' && typeof payload.website !== 'string') {
    return validationError('website', 'Invalid anti-spam field.');
  }
  if (typeof payload.website === 'string' && payload.website.trim()) {
    return validationError('website', 'Unable to accept this submission.');
  }

  if (typeof payload.requestId !== 'string') {
    return validationError('requestId', 'A valid request ID is required.');
  }
  const requestId = payload.requestId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{11,99}$/.test(requestId)) {
    return validationError('requestId', 'A valid request ID is required.');
  }

  if (!Number.isFinite(payload.formStartedAt)) {
    return validationError('formStartedAt', 'Invalid form timing data.');
  }
  const elapsed = now - payload.formStartedAt;
  if (elapsed < MIN_COMPLETION_MS || payload.formStartedAt > now + 5_000) {
    return validationError('formStartedAt', 'Please take a moment to complete the form before submitting.');
  }

  const lead = Object.create(null);
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    const value = payload[field];
    if (typeof value === 'undefined' && !rule.required) {
      lead[field] = '';
      continue;
    }
    if (typeof value !== 'string') {
      return validationError(field, `${field} must be a string.`);
    }

    const normalized = normalizeString(value, rule.collapseWhitespace);
    if (rule.required && normalized.length < rule.min) {
      return validationError(field, `${field} is required and must contain at least ${rule.min} characters.`);
    }
    if (normalized.length > rule.max) {
      return validationError(field, `${field} must contain no more than ${rule.max} characters.`);
    }
    lead[field] = normalized;
  }

  const digitCount = (lead.phone.match(/\d/g) || []).length;
  if (!/^[+()\d.\s-]+$/.test(lead.phone) || digitCount < 6) {
    return validationError('phone', 'Enter a valid phone or WhatsApp number.');
  }

  return {
    ok: true,
    value: {
      ...lead,
      requestId,
    },
  };
}

module.exports = {
  MAX_BODY_BYTES,
  MIN_COMPLETION_MS,
  isPlainRecord,
  validateLeadPayload,
};
