## Goal

1. The **Sync** button on the Daily Health card (Analytics → Performance) should poll **sleep, sleep score, RHR, and HRV** for the active provider — Garmin included — by calling Terra's `/v2/sleep` endpoint where these values actually live.
2. **Hide** the **Resync** button on the All-Activities view (don't delete the handler — it'll be reused later for a premium "refetch all activities since 2026" feature).

---

## Why the current sync doesn't get Garmin HRV

Confirmed by probing Terra's REST API directly for a Garmin user:

- `/v2/daily` for Garmin returns 500 / no HRV.
- `/v2/sleep` returns nightly `avg_hrv_rmssd` (e.g. 78, 85, 78, 73.6 ms over the last few nights) **and** `resting_hr_bpm` — exactly the schema you quoted (`hrv_samples_rmssd[]` per night).
- Webhooks for Garmin never include `rmssd` (0 of 10k+ events in 60 days).

Today `terra-sync` reads RHR from `/v2/daily` only (often null for Garmin) and never reads HRV from sleep summaries. That's why the Daily Health card shows `—` for HRV and the new Readiness card hides for Garmin users.

---

## Changes

### 1. `supabase/functions/terra-sync/index.ts` — sleep loop now also captures RHR + HRV

In the existing `/v2/sleep` block (around line 530), in addition to `sleep_seconds` / `sleep_score`, also extract:

- `resting_hr = d.heart_rate_data.summary.resting_hr_bpm` (fallback when daily endpoint omits it — true for Garmin).
- `hrv = d.heart_rate_data.summary.avg_hrv_rmssd` (the nightly RMSSD).

When merging the sleep record into `dailyByDate[date]`:
- Always **prefer** the longest sleep session's `resting_hr` / `hrv` for that night.
- Only overwrite `existing.resting_hr` / `existing.hrv` when the new value is non-null (don't clobber a value already set by `/v2/daily`).

Result: Garmin nights now land in `terra_daily_health` with `hrv` and `resting_hr` populated.

### 2. `src/hooks/use-terra-daily-health.ts` — already calls `terra-sync` with `healthOnly:true`

No change needed. The `Sync` button on the Daily Health card already invokes `terra-sync` with `{ healthOnly: true, provider }` — once the function above is fixed, one click pulls sleep / sleep score / RHR / HRV.

### 3. Backfill the last 60 days for existing Garmin users

After deploying the function, run a one-shot backfill so the Readiness card and Daily Health HRV light up immediately without users having to tap Sync. Plan: invoke `terra-sync` with `{ healthOnly: true, provider: "GARMIN", targetUserId }` (admin-only path already exists) for each active Garmin connection. Done from a small SQL → loop in the agent shell, no migration needed.

### 4. `src/components/ActivitiesTab.tsx` — hide the Resync button

Wrap the existing button (lines 570–579) in `{false && ahConnected && (...)}` (or comment it out behind a feature flag) so it disappears from the UI. **Keep** `handleResync`, `resyncing`, `setResyncing`, and `RefreshCw` import in place — they'll be repurposed for the upcoming premium "refetch all activities since 2026" feature.

---

## Out of scope (kept for later)

- Storing the per-sample `hrv_samples_rmssd[]` array (would need a new column / table). For now we only persist the nightly summary, which is what the Readiness algorithm needs.
- The premium "refetch since 2026" button — this plan only frees the slot.

---

## Verification after deploy

1. Call `terra-sync` for the Garmin test user (`6hhxbmqfy7@…`) with `{ healthOnly: true, provider: "GARMIN" }`.
2. `select date, hrv, resting_hr, sleep_seconds, sleep_score from terra_daily_health where provider='GARMIN' order by date desc limit 7;` — expect HRV values around 70–90 ms.
3. Open Analytics → Performance: Daily Health card shows RHR + sleep, HRV & Readiness card now appears for Garmin and renders the 7-day curve.
4. Open All Activities view: Resync button is gone.
