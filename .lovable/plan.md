## Goal

Pull today's (2026-05-25 HKT) activities directly from Terra with `to_webhook=false`, so no extra webhook pings hit our queue, and ingest the synchronous response through the existing webhook parser (Option A). Validate on user `c7a7…` first, then roll out to all 109 active connections, spaced 15s apart.

## Why Option A

`terra_activities` already uses `(provider, terra_activity_id)` as the natural dedup key, and the existing `processWebhook` in `_shared/terraWebhookHandler.ts` already extracts samples, laps, GPS, etc. Reusing it means:

- Dedup = the upsert itself. No drift between webhook-ingested and oneoff-ingested rows.
- One parser to maintain.
- No staging table, no promotion step.

The synchronous `/v2/activity?to_webhook=false` response has the same JSON shape as a webhook push (`{ type: "activity", user, data: [...] }`), so it slots into the existing path cleanly. The only thing to bypass is the HMAC signature check, since the call originates from us.

## Changes

### 1. `supabase/functions/_shared/terraWebhookHandler.ts`

Add a small exported helper:

```ts
export async function ingestTrustedTerraPayload(
  rawBody: string,
  env: TerraEnv = "prod",
): Promise<{ ok: boolean; error: string | null; inserted: number }>
```

- Same flow as `processQueuedTerraWebhook` but forces `signatureValid = true` (no HMAC verify, no s3_payload fetch — the body is already the full payload).
- Writes a `terra_webhook_events` audit row with `payload.via = "oneoff_sync"` so we can tell these apart in logs.
- Calls the existing `processWebhook(...)` so all upsert + sample extraction logic runs unchanged.
- Returns ingest result so the caller can mark the queue row.

### 2. `supabase/functions/terra-today-oneoff-tick/index.ts`

- Keep `to_webhook=false&with_samples=true` in the Terra API call.
- After `await res.text()`, if `res.ok`, call `ingestTrustedTerraPayload(body, "prod")`.
- Queue row status:
  - `done` if HTTP ok AND ingest ok.
  - `error` if HTTP failed OR ingest returned an error (store ingest error in `result`).
- Keep self-unschedule when queue empty.
- Trim `result` storage to a short status string (no need to dump 1MB+ payloads into the queue table).

### 3. Single-user test for `c7a7…`

After deploy:

1. Read DB: get `terra_user_id` + `provider` for the c7a7 user from `terra_connections`.
2. Snapshot baseline: count of `terra_activities` rows for that user with `start_time::date = '2026-05-25'`.
3. Insert ONE pending row into `terra_today_oneoff_queue` for that user, `target_date = 2026-05-25`.
4. Invoke `terra-today-oneoff-tick` once via `curl_edge_functions` (passing `x-webhook-key`).
5. Verify:
   - Queue row → `status='done'`, `http_status=200`.
   - `terra_activities` count for that user/date ≥ baseline; new rows have `provider` set, GPS/samples populated.
   - `terra_webhook_events` for that `terra_user_id` shows ONE new row with `payload.via = "oneoff_sync"` and NO new `type='activity'` push from Terra.
   - Edge function logs show clean ingest, no signature errors.

### 4. Rollout (only after test passes)

- Insert one `pending` row per active `terra_connections` for `target_date = 2026-05-25` (skip the c7a7 row already done).
- Schedule pg_cron job `terra-today-oneoff` with `'15 seconds'` interval, calling the tick endpoint with `x-webhook-key` from `vault.decrypted_secrets` (same pattern as existing `terra-webhook-drain`).
- Tick self-unschedules when queue drains (~27 min for 108 remaining at 15s).

## Verification during rollout

- Watch `terra_today_oneoff_queue` status distribution.
- Watch `terra_activities` insert rate.
- Confirm `terra_webhook_events` does NOT show a spike of `type='activity'` pushes from Terra for these users (proves no loop re-triggered).

## Out of scope

- No changes to the main webhook handler dedup, worker, or any other Terra entrypoint.
- No change to `to_webhook` semantics anywhere else.
- No new tables.
