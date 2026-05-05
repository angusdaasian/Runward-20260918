# Terra On-Auth Sync: Activities + Today's Daily Stats

## Current vs Desired

**Now**
- On `auth` webhook, only `GARMIN` triggers a 7-day historical re-fetch (already trimmed to `activity` only).
- Coros / Suunto / Polar / others get nothing on auth — user has to wait for Terra's live webhooks.
- `terra_daily_health` has no HRV column.

**Goal**
- On `auth` for **every** Terra provider (Garmin, Coros, Suunto, Polar, …):
  1. Fetch past **7 days of activities** only (no historical daily/sleep backfill).
  2. Fetch **today's** `daily` + `sleep` snapshot once and append sleep duration, sleep score, HRV, VO2max to `terra_daily_health`.

## Changes

### 1. DB migration — add HRV column
```sql
alter table public.terra_daily_health
  add column if not exists hrv numeric;
```

### 2. `supabase/functions/terra-webhook/index.ts`

**Remove the `if (provider === "GARMIN")` guard** around the historical re-fetch block so it runs for all providers.

**Inside that block, two separate Terra calls (in background via the existing IIFE):**
- `GET /v2/activity?start_date=<today-7>&end_date=<today>&to_webhook=true&with_samples=true`
- `GET /v2/daily?start_date=<today>&end_date=<today>&to_webhook=true&with_samples=false`
- `GET /v2/sleep?start_date=<today>&end_date=<today>&to_webhook=true&with_samples=false`

The activity range stays at 7 days. Daily/sleep are constrained to **today only** (single day) so the webhook payloads stay small and don't 504.

Log the combined result row as `type: "terra_backfill"` with `provider` in the payload (replacing today's `garmin_backfill`).

**Update the `daily` handler** to also persist HRV when present:
```ts
hrv: toFiniteNumber(d?.heart_rate_data?.summary?.avg_hrv_rmssd)
   ?? toFiniteNumber(d?.heart_rate_data?.summary?.hrv_rmssd)
   ?? toFiniteNumber(d?.heart_rate_data?.summary?.avg_hrv)
   ?? null,
```
Add it to the upsert payload alongside the existing `vo2max`, `resting_hr`, `steps`.

The existing `sleep` handler already populates `sleep_seconds` + `sleep_score` — no change needed there beyond the new today-only backfill triggering it.

### 3. `src/hooks/use-terra-daily-health.ts`
Add `hrv` to the select list and `TerraDailyHealthRow` interface so the column is exposed to UI consumers (no UI rendering changes in this task — just plumbing so it's available).

## What this fixes / doesn't change
- Coros/Suunto/Polar users now get their last week of runs immediately on connect (same as Garmin).
- No historical daily/sleep pulls → no more 504s from Garmin connect.
- Today's daily snapshot still gets fetched once on auth, then live webhooks keep it fresh.
- `recalcUserXp`, polyline merging, Garmin-Railway dedupe — all untouched.
