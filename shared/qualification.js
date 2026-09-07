(function exposeQualificationNormalizer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadPilotQualification = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createQualificationNormalizer() {
  'use strict';

  const CATEGORIES = {
    temperature: new Set(['hot', 'warm', 'cold']),
    intent: new Set(['high', 'medium', 'low']),
    urgency: new Set(['high', 'medium', 'low']),
    budgetFit: new Set(['strong', 'moderate', 'weak']),
  };

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function optionalText(value, maxLength) {
    if (value == null) return '';
    if (typeof value !== 'string') throw new Error('Expected a text field.');
    return value.trim().slice(0, maxLength);
  }

  function category(value, allowed, label) {
    if (typeof value !== 'string') throw new Error(`Missing ${label}.`);
    const normalized = value.trim().toLowerCase();
    if (!allowed.has(normalized)) throw new Error(`Unknown ${label}.`);
    return normalized;
  }

  function requestId(value) {
    if (value == null || value === '') return '';
    if (typeof value !== 'string') throw new Error('Invalid request ID.');
    const normalized = value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{11,99}$/.test(normalized)) {
      throw new Error('Invalid request ID.');
    }
    return normalized;
  }

  function normalizeQualificationResponse(payload) {
    if (!isRecord(payload) || !isRecord(payload.qualification)) {
      throw new Error('Missing qualification data.');
    }
    if (typeof payload.success !== 'undefined' && payload.success !== true) {
      throw new Error('Upstream qualification was not successful.');
    }

    const source = payload.qualification;
    const score = typeof source.score === 'string' && source.score.trim() !== ''
      ? Number(source.score)
      : source.score;
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      throw new Error('Qualification score must be between 0 and 10.');
    }

    return {
      success: true,
      requestId: requestId(payload.requestId),
      message: optionalText(payload.message, 300),
      qualification: {
        score,
        temperature: category(source.temperature ?? source.priority, CATEGORIES.temperature, 'priority'),
        purchaseIntent: category(source.purchaseIntent ?? source.intent, CATEGORIES.intent, 'intent'),
        urgency: category(source.urgency, CATEGORIES.urgency, 'urgency'),
        budgetFit: category(source.budgetFit, CATEGORIES.budgetFit, 'budget fit'),
        summary: optionalText(source.summary, 500),
        qualificationReason: optionalText(source.qualificationReason ?? source.rationale, 1_200),
        recommendedAction: optionalText(source.recommendedAction, 500),
        suggestedReply: optionalText(source.suggestedReply, 2_000),
      },
    };
  }

  return { normalizeQualificationResponse };
});
