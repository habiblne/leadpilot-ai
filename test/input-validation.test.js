'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLeadPayload } = require('../lib/input-validation');

const now = 2_000_000;

function validPayload(overrides = {}) {
  return {
    name: '  Ahmed   Benali  ',
    phone: '+213 550 123 456',
    business: 'Benali Fashion',
    service: 'Lead qualification automation',
    budget: '120,000 DZD',
    message: 'We want to launch within the next seven days.',
    website: '',
    requestId: '123e4567-e89b-12d3-a456-426614174000',
    formStartedAt: now - 5_000,
    ignoredProperty: 'removed',
    ...overrides,
  };
}

test('normalizes allowed lead fields and removes unexpected properties', () => {
  const result = validateLeadPayload(validPayload(), now);
  assert.equal(result.ok, true);
  assert.equal(result.value.name, 'Ahmed Benali');
  assert.equal(result.value.ignoredProperty, undefined);
  assert.equal(result.value.formStartedAt, undefined);
  assert.equal(result.value.website, undefined);
});

test('rejects missing required fields', () => {
  const payload = validPayload();
  delete payload.message;
  const result = validateLeadPayload(payload, now);
  assert.equal(result.ok, false);
  assert.equal(result.error.field, 'message');
});

test('rejects malformed and nested payload values', () => {
  const result = validateLeadPayload(validPayload({ business: { name: 'Nested' } }), now);
  assert.equal(result.ok, false);
  assert.equal(result.error.field, 'business');
});

test('rejects prototype-pollution-style keys', () => {
  const payload = JSON.parse(JSON.stringify(validPayload()).replace(/}$/, ',"__proto__":{"polluted":true}}'));
  const result = validateLeadPayload(payload, now);
  assert.equal(result.ok, false);
  assert.equal(result.error.field, 'payload');
});

test('rejects honeypot and implausibly fast submissions', () => {
  assert.equal(validateLeadPayload(validPayload({ website: 'spam.example' }), now).ok, false);
  assert.equal(validateLeadPayload(validPayload({ formStartedAt: now - 100 }), now).ok, false);
});
