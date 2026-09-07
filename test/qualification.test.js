'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQualificationResponse } = require('../shared/qualification');

function validResponse(overrides = {}) {
  return {
    message: 'Lead qualified successfully.',
    qualification: {
      score: '8',
      priority: 'HOT',
      intent: 'HIGH',
      urgency: 'medium',
      budgetFit: 'strong',
      rationale: 'Clear purchase intent.',
      recommendedAction: 'Call today.',
      suggestedReply: 'Thanks for reaching out.',
      ...overrides,
    },
  };
}

test('normalizes score and supported response aliases', () => {
  const result = normalizeQualificationResponse(validResponse());
  assert.equal(result.qualification.score, 8);
  assert.equal(result.qualification.temperature, 'hot');
  assert.equal(result.qualification.purchaseIntent, 'high');
  assert.equal(result.qualification.qualificationReason, 'Clear purchase intent.');
});

test('keeps missing optional display fields safe', () => {
  const result = normalizeQualificationResponse(validResponse({ suggestedReply: undefined, summary: undefined }));
  assert.equal(result.qualification.suggestedReply, '');
  assert.equal(result.qualification.summary, '');
});

test('rejects scores outside the supported range', () => {
  assert.throws(() => normalizeQualificationResponse(validResponse({ score: 11 })), /between 0 and 10/);
});

test('rejects unknown categories and malformed API responses', () => {
  assert.throws(() => normalizeQualificationResponse(validResponse({ urgency: 'immediate' })), /Unknown urgency/);
  assert.throws(() => normalizeQualificationResponse({ qualification: null }), /Missing qualification data/);
});

test('validates a request ID when the API returns one', () => {
  const result = normalizeQualificationResponse({
    ...validResponse(),
    requestId: '123e4567-e89b-12d3-a456-426614174000',
  });
  assert.equal(result.requestId, '123e4567-e89b-12d3-a456-426614174000');
  assert.throws(
    () => normalizeQualificationResponse({ ...validResponse(), requestId: 'invalid' }),
    /Invalid request ID/,
  );
});

test('rejects an explicit unsuccessful upstream payload', () => {
  assert.throws(
    () => normalizeQualificationResponse({ ...validResponse(), success: false }),
    /not successful/,
  );
});
