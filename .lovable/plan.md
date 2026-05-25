## Problem

Terra fires its 8-second circuit breaker when a webhook endpoint takes too long to respond. Today `terra-webhook` already uses `EdgeRuntime.waitUntil` to push the heavy work into the background, but before returning 200 it still does, on the request thread:

1. `await req.text()` on payloads that for `activity` can be many MB (HR + distance + elevation + cadence samples, often 10k+ entries).
2. Synchronous signature verification (HMAC over the whole raw body).
3. `JSON.parse(raw)` on that same large body.
4. An `await` insert into `terra_webhook_events` that includes a derived subset of the payload.

On cold starts or large activity payloads (the very ones we're seeing in logs — `hr_samples=14674`, `laps=22`, etc.) this stack alone blows past 8s, and Terra disables the webhook.

The DB already has the scaffolding for a proper queue: a `terra_webhook_queue` table and a `claim_terra_webhook_queue(batch_size)` RPC — but nothing writes to or drains it.

## Solution

Switch `terra-webhook` to **enqueue-and-return**, and add a worker that does the real processing out-of-band. This matches Terra's own recommendation and the queue-based pattern already used for `terra-today-oneoff-tick`.

### 1. `terra-webhook` becomes a thin enqueuer

New flow in `supabase/functions/_shared/terraWebhookHandler.ts` (`handleTerraWebhook`):

- Read `raw = await req.text()` and grab the `terra-signature` header.
- Single insert into `terra_webhook_queue` with `{ env, raw_body: raw, signature_header: sig, status: 'pending' }`.
- Immediately return `200 { ok: true }`.
- **No** signature verification, **no** `JSON.parse`, **no** `terra_webhook_events` insert, **no** `EdgeRuntime.waitUntil`.

This makes the hot path one DB insert — typically <100 ms — regardless of payload size.

`terra-webhook` and `terra-webhook-test` both keep calling `handleTerraWebhook(req, env)`; only the body of that function changes.

### 2. New worker function `terra-webhook-worker`

`supabase/functions/terra-webhook-worker/index.ts`:

- Auth: requires `x-webhook-key === WEBHOOK_AUTH_KEY` (same pattern as `terra-today-oneoff-tick`).
- Loops up to N iterations (e.g. 5) per invocation:
  - `supa.rpc('claim_terra_webhook_queue', { batch_size: 3 })` to atomically claim pending rows (the RPC already handles stale `processing` reset and `FOR UPDATE SKIP LOCKED`).
  - For each claimed row: parse JSON, verify signature using the row's `env`, run the existing `processWebhook(...)` logic, then update the row to `status='done'` (or `status='error'` with `last_error` and let the RPC's attempt cap promote it to `failed` after 5 tries). Also write the `terra_webhook_events` row that the inline handler used to write (move that insert into the worker).
  - Break out early if `claim_terra_webhook_queue` returns no rows.
- Return summary `{ processed, errors }`.

Refactor: extract the current body of `handleTerraWebhook` (signature verify + event insert + `processWebhook`) into an exported `processQueuedTerraWebhook({ env, raw_body, signature_header })` helper inside the shared file, and have both the worker and a backfill path call it.

### 3. Drain trigger

Two options, pick the cheaper one:

- **Cron**: pg_cron job `terra-webhook-drain` every minute that `net.http_post`s `terra-webhook-worker` with `x-webhook-key`. Simple and matches existing jobs (`scrape-races-weekly`, `daily-morning-push-8am-hkt`). Latency: up to 60s, acceptable for the data we're storing.
- **Pg trigger on insert**: AFTER INSERT on `terra_webhook_queue` calls `net.http_post` to the worker. Near-instant processing, more moving parts.

Recommended: **cron every minute** for simplicity, plus call the worker once at the end of `terra-webhook` (fire-and-forget `EdgeRuntime.waitUntil(fetch(workerUrl))`) so the common case feels near-realtime without waiting for cron.

### 4. Migration

```sql
select cron.schedule(
  'terra-webhook-drain',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-webhook-worker',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'x-webhook-key', (select decrypted_secret from vault.decrypted_secrets where name='webhook_auth_key' limit 1)
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ); $$
);
```

Plus an `unschedule_terra_webhook_drain()` helper mirroring the existing oneoff one.

## Files touched

- `supabase/functions/_shared/terraWebhookHandler.ts` — split into enqueue (new `handleTerraWebhook`) and worker-side `processQueuedTerraWebhook`.
- `supabase/functions/terra-webhook-worker/index.ts` — new.
- New migration: cron job + unschedule helper.
- `terra-webhook` and `terra-webhook-test` entrypoints unchanged (they just call `handleTerraWebhook`).

## Verification

- Trigger a known-large activity (e.g. one of the `hr_samples>10000` ones in recent logs) via `terra-webhook-test` and confirm:
  - Response returns in <500 ms.
  - A row lands in `terra_webhook_queue` with `status='pending'`.
  - Within ≤60s the worker flips it to `done` and the corresponding `terra_activities` row is upserted.
- Check `terra_webhook_events` still gets written (from the worker now).
- Re-deploy `terra-webhook` and watch logs to confirm no more shutdown-mid-processing patterns and that response times are flat regardless of payload size.
