'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const health = require('../api/health');

function response() {
  const headers = {};
  let body = '';
  return {
    statusCode: 200,
    setHeader(name, value) { headers[name] = value; },
    end(value = '') { body = value; },
    get headers() { return headers; },
    get json() { return JSON.parse(body); },
  };
}

test('health reports readiness booleans without exposing values', () => {
  const originalUrl = process.env.N8N_WEBHOOK_URL;
  const originalSecret = process.env.N8N_WEBHOOK_SECRET;
  process.env.N8N_WEBHOOK_URL = 'https://example.test/webhook';
  process.env.N8N_WEBHOOK_SECRET = 'test-secret-that-is-at-least-32-characters';

  try {
    const result = response();
    health({ method: 'GET' }, result);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.json, { status: 'ok', n8nConfigured: true, secretConfigured: true });
    assert.equal(JSON.stringify(result.json).includes('example.test'), false);
    assert.equal(JSON.stringify(result.json).includes(process.env.N8N_WEBHOOK_SECRET), false);
  } finally {
    if (typeof originalUrl === 'undefined') delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = originalUrl;
    if (typeof originalSecret === 'undefined') delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = originalSecret;
  }
});

test('health fails safely when configuration is incomplete', () => {
  const originalUrl = process.env.N8N_WEBHOOK_URL;
  const originalSecret = process.env.N8N_WEBHOOK_SECRET;
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_WEBHOOK_SECRET;

  try {
    const result = response();
    health({ method: 'GET' }, result);
    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.json, { status: 'not_ready', n8nConfigured: false, secretConfigured: false });
  } finally {
    if (typeof originalUrl === 'undefined') delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = originalUrl;
    if (typeof originalSecret === 'undefined') delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = originalSecret;
  }
});
