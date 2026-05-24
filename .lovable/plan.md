## Goal

Trigger a one-off Terra **activity** sync for **today (2026-05-24 UTC)** for every active Terra connection, staggered **2 minutes apart per user** so we don't hammer Terra's API and don't fight the 8s webhook circuit breaker.

## Approach

A one-off script run from the sandbox — no new permanent edge function, no schema changes, no UI.

### Steps

1. **Enumerate users**
   - `SELECT user_id, terra_user_id, provider FROM terra_connections WHERE active = true` (prod env by default).

2. **For each connection, call Terra's activity endpoint with `to_webhook=true`**
   ```
   GET https://api.tryterra.co/v2/activity
       ?user_id=<terra_user_id>
       &start_date=2026-05-24
       &end_date=2026-05-24
       &to_webhook=true
       &with_samples=true
   Headers: dev-id, x-api-key  (TERRA_DEV_ID / TERRA_API_KEY)
   ```
   Terra responds 200 immediately and then POSTs the full activity payload to `terra-webhook`, which already handles upsert into `terra_activities`.

3. **Pacing**: `await sleep(120_000)` (2 minutes) between each user. Log per-user: `provider`, `terra_user_id`, HTTP status, `terra-reference` header.

4. **Audit log**: insert one summary row into `terra_webhook_events` with `type='one_off_today_backfill'` containing the per-user results (mirrors how `terra-confirm` logs its backfill), so we have a record of what was triggered.

5. **Verification**: after the run, query
   ```sql
   SELECT user_id, COUNT(*) FROM terra_activities
   WHERE start_time::date = '2026-05-24'
   GROUP BY user_id;
   ```
   and report the count.

## Technical notes

- Run via `code--exec` with a Deno/Node one-shot using `TERRA_DEV_ID` + `TERRA_API_KEY` from env, and `psql` for the connection list + audit insert.
- Total wall time ≈ `N_users × 2` minutes. With sandbox `code--exec` capped at 600s (10 min) per call, the script will run in chunks of ~4 users per call, resuming from where it left off (tracked by a small `/tmp/terra_today_progress.json` file).
- No code in the repo changes; this is purely operational.

## Open questions before I run it

1. Prod only, or include the `test` Terra env too?
2. Today = 2026-05-24 **UTC**, correct? Or local timezone?
