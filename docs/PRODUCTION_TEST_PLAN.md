# LeadPilot Production Test Plan

Run this checklist against a Vercel Preview environment connected to a dedicated n8n test workflow and test CRM sheet first. Record the Vercel deployment URL, n8n workflow version, test timestamp, and each `requestId`. Do not use real customer data.

## Preconditions

- `N8N_WEBHOOK_URL` points to the newly rotated production/test webhook path.
- `N8N_WEBHOOK_SECRET` is at least 32 characters and matches n8n's Webhook Header Auth credential.
- Native n8n Header Auth is enabled on `X-LeadPilot-Secret`.
- Durable `requestId` deduplication is configured, or the test is explicitly classified as controlled-demo testing.
- Gemini, test CRM, Gmail recipient, Error Workflow, and execution retention are configured.
- `GET /api/health` returns HTTP `200` with `status: "ok"`; it must not reveal either configured value.

## Test 1 — HOT Lead

1. Select the HOT preset and submit once.
2. Capture the browser/API `requestId` and find the matching Vercel and n8n log entries.

Expected:

- `/api/qualify` returns HTTP `200` and `success: true`.
- The dashboard displays a valid HOT qualification and score in the configured HOT range.
- Intent, urgency, budget fit, rationale, action, and suggested reply render safely.
- Exactly one CRM row is created with the same `requestId`.
- Exactly one Gmail HOT alert is sent.
- Raw JSON and copy-suggested-reply controls work.

## Test 2 — WARM Lead

1. Select the WARM preset and submit once.

Expected:

- A WARM result is displayed and exactly one CRM record is created.
- No HOT-only Gmail alert is sent unless the documented workflow rules explicitly require one.

## Test 3 — COLD Lead

1. Select the COLD preset and submit once.

Expected:

- A COLD result is displayed and exactly one CRM record is created.
- The workflow follows the documented COLD route and sends no HOT-only alert.

## Test 4 — Invalid Form

1. Leave one required field empty and submit.
2. Repeat with a customer message shorter than 10 characters.

Expected:

- The browser or API rejects the submission with a user-friendly validation message.
- No n8n execution, CRM row, Gemini call, or Gmail alert occurs.
- The submit button remains usable after correction.

## Test 5 — Double Submit

1. Submit a valid lead and immediately double-click the button.
2. Replay the same captured JSON request with the same `requestId`.

Expected:

- The button disables while the first request is pending.
- One logical lead is processed.
- The same `requestId` never creates a second CRM row or alert.
- A warm-instance replay may include `Idempotency-Replayed: true`; durable n8n/database deduplication remains the authoritative check.

## Test 6 — Wrong Webhook Secret

1. Temporarily set a different `N8N_WEBHOOK_SECRET` in the Vercel Preview environment and redeploy.
2. Submit a valid lead.

Expected:

- n8n returns HTTP `401` or `403` at the Webhook authentication layer.
- Gemini does not execute, the CRM is untouched, and Gmail is not triggered.
- `/api/qualify` returns a safe failure without revealing either secret.
- The frontend displays a friendly error and re-enables the button.

Restore the correct secret and redeploy before continuing.

## Test 7 — n8n Unavailable

1. In Preview only, point `N8N_WEBHOOK_URL` to a controlled unavailable HTTPS test endpoint or temporarily deactivate the test workflow.
2. Submit a valid lead.

Expected:

- The API returns a bounded timeout or safe upstream-unavailable/network error.
- No raw infrastructure error or URL appears in the browser.
- The stepper stops and the submit button recovers.

Restore the correct URL and redeploy.

## Test 8 — Malformed n8n Response

1. In the dedicated test workflow, temporarily return invalid JSON and then a JSON object with an invalid score/category.

Expected:

- The API rejects invalid JSON/schema with `INVALID_UPSTREAM_RESPONSE`.
- No fabricated qualification is displayed and the dashboard does not crash.
- The frontend shows a safe error and re-enables submission.

Restore the canonical response schema.

## Test 9 — Rate Limit

1. Send more than eight distinct valid submissions from one client/IP within 60 seconds in Preview.

Expected:

- Excess requests return HTTP `429`, `RATE_LIMITED`, and `Retry-After`.
- The browser displays a clean wait-and-retry message.
- Remember that this confirms only per-instance protection, not distributed enforcement.

## Test 10 — Mobile

1. Test at approximately 375 × 812 CSS pixels and one additional physical phone if available.
2. Exercise HOT/WARM/COLD presets, Clear, submit success/error, dashboard, Raw JSON, and copy reply.

Expected:

- No horizontal page overflow, clipped controls, overlapping panels, or unreadable text.
- Form fields, button, stepper, score, metrics, and result controls remain operable.
- The honeypot is not visible or reachable by keyboard/assistive navigation.

## Release Acceptance

Promote to public production only after all tests pass, n8n Header Auth is confirmed, durable deduplication is proven under concurrent replay, the old webhook path is retired, and Vercel/n8n logs show no unexplained failures.
