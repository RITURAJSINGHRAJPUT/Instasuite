# Operations

## Instagram token refresh (required)

Instagram long-lived tokens expire after **60 days**. If one expires the account
silently stops replying — the only symptom is a `190` in the logs.

`POST /api/cron/refresh-tokens` renews every non-disabled account whose token
expires within 10 days (or whose expiry is unknown). It verifies each new token
against Meta before overwriting the old one, so a failed refresh leaves the
working token in place.

Schedule it **daily** (Meta requires a token to be >24h old to refresh):

    curl -X POST https://<your-domain>/api/cron/refresh-tokens \
      -H "Authorization: Bearer $CRON_SECRET"

On Vercel, add to `vercel.json`:

    { "crons": [{ "path": "/api/cron/refresh-tokens", "schedule": "0 3 * * *" }] }

The route fails closed: without a matching `CRON_SECRET` (or a super_admin
session) it 404s. `/api/cron` is excluded from the proxy matcher so the
scheduler's Bearer token reaches the route's own guard.

## Concurrency

`MAX_CONCURRENT_REPLIES` (default 4) bounds simultaneous AI replies **per server
instance**. Webhooks are always acked immediately; work queues behind the gate.
Running multiple instances needs a shared queue (Redis/pg-boss) — this in-process
gate does not coordinate across them.
