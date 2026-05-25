## Goal

Make the two manual sync buttons pull data directly from Terra with `to_webhook=false` so users get an instant result without waiting for webhooks, while keeping the regular webhook path untouched. Use the same trusted-ingest pipeline as the one-off tick so activities come through with full samples and zero risk of re-triggering Terra.

## What's already true

- `terra-sync` already calls Terra with `to_webhook=false` for `activity`, `daily`, `body`, and `sleep` — no webhook side effects today.
- `useRefreshTerraDailyHealth` (daily health card refresh button) already invokes `terra-sync` with `healthOnly: true`. Health refresh already does what the user wants; the only thing to do here is make sure the toast surfaces what was updated.
- The home page "Fetch today" button (`ActivitiesTab.handleFetchTodayTerra`) and the resync button both already hit `terra-sync` with `to_webhook=false`, but the activity branch ingests through the older `upsertTerraActivity` parser, which produces thinner rows than the webhook parser (e.g. HR/distance/elevation/cadence sample arrays can be missing or partial).

## What changes

### 1. `supabase/functions/terra-sync/index.ts` — route activity ingest through the trusted handler

In the activity branch (around L468–541), after the `to_webhook=false&with_samples=true` fetch:

- Build a synthetic Terra webhook envelope per item:
  ```json
  { "type": "activity", "user": { "user_id": c.terra_user_id, "reference_id": c.reference_id }, "data": [item] }
  ```
- Call `ingestTrustedTerraPayload(JSON.stringify(env), "prod")` (the same helper used by `terra-today-oneoff-tick`).
- Replace the `upsertTerraActivity(...)` call with this. Keep the existing `latestWithSamples` filter and the existing backfill-missing-samples loop (the backfill loop is still useful for older rows already in DB).
- Tag the audit row with `payload.via = "manual_sync"` (the helper already writes `terra_webhook_events` — extend the helper or pass a `source` arg so we can distinguish `oneoff_sync` vs `manual_sync` in logs).
- Sum `inserted` counts from the helper and return as `activities` so the existing toast logic ("Fetched today's latest activity" / "No new activity for today yet") still works.

Result: pressing the home page button gives the user a row with the same shape and sample density as a webhook-delivered activity, immediately, with no Terra webhook traffic generated.

### 2. `terra-sync` — small tweaks for the manual UX

- When the body has `dayOnly: true` OR an explicit `startDate==endDate-1`, skip the 30-day window math (already correct) and also skip the missing-samples backfill loop (we only want today's data for that path).
- Return `{ ok, activities, daily, health: { sleep, vo2max, resting_hr, hrv } }` so the daily-health refresh toast can mention what got updated.

### 3. `src/hooks/use-terra-daily-health.ts` — better refresh toast

- After the call, look at the response counts and show "Updated sleep, VO₂max, RHR" (zh equivalent) instead of the current generic success message. Fall back to the generic message when counts are unknown.
- No change to the request itself.

### 4. `src/components/ActivitiesTab.tsx` — keep existing button, just call the updated function

- No code change required if the request shape stays the same; the toast already handles `activities === 0` vs `> 0`.
- Optional: pass `provider` if the user has multiple connections so we don't hit all providers on every tap (out of scope unless you want it).

### 5. Garmin daily health refresh button

- `useRefreshGarminDailyHealth` already calls `garmin-daily-health-sync` which is the native (non-Terra, non-webhook) Garmin path. No change needed — it already pulls on demand.

## Out of scope

- The one-off queue, the 15s cron, and the webhook worker — no changes.
- Any change to webhook behaviour when Terra does push us data.
- Apple Health / Strava manual sync paths.

## Verification

1. Press "Fetch today" on the home page with a connected COROS/Garmin user that has a today activity not yet webhook'd → `terra_activities` row appears with full `hr_samples`, `distance_samples`, `elevation_samples`, `cadence_samples`, polyline; `terra_webhook_events` shows a `payload.via = "manual_sync"` audit row; `terra_today_oneoff_queue` is untouched; Terra dashboard shows no extra webhook delivery.
2. Press refresh on the Garmin/Terra health card → `terra_daily_health` row for today is upserted with sleep + vo2max + RHR (when available); toast lists what was updated.
3. Press "Fetch today" twice in a row → second press is a no-op insert (dedup on `(user_id, terra_activity_id)`); no duplicate rows, no errors.
