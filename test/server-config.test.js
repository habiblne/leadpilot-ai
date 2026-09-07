'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MIN_SECRET_LENGTH, inspectN8nConfig } = require('../lib/server-config');

test('requires both a valid URL and a strong secret', () => {
  const missingSecret = inspectN8nConfig({ N8N_WEBHOOK_URL: 'https://example.test/webhook' });
  assert.equal(missingSecret.ready, false);
  assert.equal(missingSecret.n8nConfigured, true);
  assert.equal(missingSecret.secretConfigured, false);

  const ready = inspectN8nConfig({
    N8N_WEBHOOK_URL: 'https://example.test/webhook',
    N8N_WEBHOOK_SECRET: 'a'.repeat(MIN_SECRET_LENGTH),
  });
  assert.equal(ready.ready, true);
});

test('rejects insecure remote URLs and weak secrets', () => {
  assert.equal(inspectN8nConfig({
    N8N_WEBHOOK_URL: 'http://example.test/webhook',
    N8N_WEBHOOK_SECRET: 'a'.repeat(MIN_SECRET_LENGTH),
  }).n8nConfigured, false);
  assert.equal(inspectN8nConfig({
    N8N_WEBHOOK_URL: 'https://example.test/webhook',
    N8N_WEBHOOK_SECRET: 'too-short',
  }).secretConfigured, false);
  assert.equal(inspectN8nConfig({
    N8N_WEBHOOK_URL: 'https://user:password@example.test/webhook',
    N8N_WEBHOOK_SECRET: 'a'.repeat(MIN_SECRET_LENGTH),
  }).n8nConfigured, false);
});

test('allows HTTP only for local development hosts', () => {
  const config = inspectN8nConfig({
    N8N_WEBHOOK_URL: 'http://127.0.0.1:5678/webhook/test',
    N8N_WEBHOOK_SECRET: 'a'.repeat(MIN_SECRET_LENGTH),
  });
  assert.equal(config.ready, true);
});
