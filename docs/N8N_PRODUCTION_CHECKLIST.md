# n8n Production Checklist

The n8n workflow is not stored in this repository. Complete and test these changes in n8n before treating the integration as production-ready.

## Authentication

Use n8n's native Webhook **Header Auth** credential. This is preferable to an IF/Code node because n8n rejects the request at the trigger, before a workflow execution can reach Gemini, Google Sheets, Gmail, or another paid/business node. n8n documents Header Auth as a supported Webhook authentication method in its [Webhook node documentation](https://github.com/n8n-io/n8n-docs/blob/main/docs/integrations/builtin/core-nodes/n8n-nodes-base.webhook/README.md) and [Webhook credentials documentation](https://github.com/n8n-io/n8n-docs/blob/main/docs/integrations/builtin/credentials/webhook.md).

1. Generate a secret of at least 32 characters. Store the same value in Vercel as `N8N_WEBHOOK_SECRET` and in n8n's credential store. Never paste it into a workflow expression or export.
2. In n8n, create a **Header Auth** credential:
   - Header name: `X-LeadPilot-Secret`
   - Header value: the generated secret
3. Open the production workflow's Webhook trigger.
4. Change **Authentication** from `None` to `Header Auth` and select that credential.
5. Publish/activate the workflow.
6. Send a request with an absent or incorrect header and confirm n8n returns HTTP `401` or `403` and creates no downstream execution/side effect.
7. Send a request with the matching header and confirm the workflow reaches validation.

The Vercel API now fails closed and will not contact n8n unless both environment variables are valid and the secret is at least 32 characters. Do not enable public traffic until native Header Auth is confirmed. If an older/custom n8n deployment cannot use native Header Auth, put an IF/Code validation gate immediately after the Webhook and route failure directly to a generic `403` Respond to Webhook node. Every business node must be downstream of the authenticated branch; this fallback is less desirable because the workflow has already started.

## Previously Exposed Webhook URL

The former production webhook URL exists in this Git repository's history. Deleting `config.js` from the current tree does not remove historical copies. Before controlled production testing:

1. Change the Webhook node path or create a new Webhook trigger so n8n issues a new production URL.
2. Update `N8N_WEBHOOK_URL` in Vercel without committing the value.
3. Redeploy and confirm the old URL no longer triggers business processing.
4. Keep Header Auth enabled even after rotating the URL.

## Idempotency

The API forwards `requestId` in both the JSON body and `X-LeadPilot-Request-Id` header. Use a transactional datastore with a unique constraint; do not use Google Sheets as an atomic lock.

Recommended PostgreSQL/Supabase table:

```sql
CREATE TABLE lead_requests (
  request_id text PRIMARY KEY,
  status text NOT NULL,
  response_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
```

Exact workflow strategy:

1. After authentication and input validation, attempt `INSERT INTO lead_requests (request_id, status) VALUES ($1, 'processing') ON CONFLICT DO NOTHING RETURNING request_id` using a parameterized query.
2. Continue to Gemini/scoring only when the insert returns the new ID. That execution owns the reservation.
3. If no row is returned, fetch the existing record:
   - `completed`: return its stored response and stop.
   - `processing`: return a duplicate/in-progress response and stop; do not run side effects.
   - `failed`: follow a documented manual or atomic retry policy before taking ownership.
4. Only the reservation-owning execution may create the CRM row or send the HOT alert.
5. After all required operations succeed, atomically update the row to `completed` and store the response JSON.
6. On failure, update the reservation to `failed` from the Error Workflow with the execution ID and failure timestamp.

If Google Sheets is the only available store, a lookup-then-append flow with workflow concurrency constrained to one is acceptable for a controlled demo, but it is not safe atomic deduplication for public production. The API's in-memory cache only reduces duplicates on one warm Vercel instance.

## Error Workflow

Create an n8n Error Workflow and attach it to the production workflow. Capture the workflow name, execution ID, failing node, timestamp, and `requestId`. Send operational alerts to a monitored channel without including the full lead message unless necessary.

## Retries

- Retry transient read-only calls and rate-limited provider requests with bounded exponential backoff.
- Do not automatically retry CRM inserts, emails, or messages unless the node is idempotent by `requestId`.
- Set explicit node timeouts below the Vercel proxy's 20-second upstream timeout, or respond before slower asynchronous branches begin.
- Route exhausted retries into the Error Workflow.

## Structured AI Output

Require Gemini to return JSON matching a strict schema. At minimum validate:

```json
{
  "score": "number from 0 through 10",
  "temperature": "hot | warm | cold",
  "purchaseIntent": "high | medium | low",
  "urgency": "high | medium | low",
  "budgetFit": "strong | moderate | weak",
  "summary": "string",
  "qualificationReason": "string",
  "recommendedAction": "string",
  "suggestedReply": "string"
}
```

Reject or route malformed AI output for review. Do not silently invent missing classifications.

## Deterministic Scoring

Keep final score calculation and routing in an n8n Code/IF node or application code, not in the LLM prompt:

- `0-4` = `COLD`
- `5-7` = `WARM`
- `8-10` = `HOT`

If the existing business rule is still authoritative, enforce a minimum score of 8 when purchase intent is high, urgency is high, and budget fit is strong. AI extracts the attributes; deterministic rules own the final score and routing decision.

## CRM

Google Sheets is suitable for an MVP or lower-volume small-business workflow. Use `requestId` as a unique column and protect access to the sheet. For higher concurrency, auditability, or customer isolation, migrate to HubSpot, Pipedrive, GoHighLevel, Supabase, PostgreSQL, or another transactional CRM/data store.

## Monitoring

- Review n8n failed executions and retention settings.
- Alert on repeated webhook authentication failures, Gemini failures, schema failures, CRM write failures, and alert delivery failures.
- Include `requestId` in every node's execution data for correlation with Vercel logs.
- Track success rate and latency by stage without logging secrets or full lead messages.
- Run a scheduled synthetic submission against a dedicated test workflow and verify the result without polluting production CRM data.
