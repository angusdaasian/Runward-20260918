## HRV data check

Yes — HRV is being received and stored in `terra_daily_health.hrv` (nightly RMSSD in ms). Verified via DB query: COROS users have daily HRV values for the past week (range observed ~29-123 ms across users).

The hook `useTerraDailyHealth` already selects `hrv` and returns up to 60 days, but the UI (`HealthStatsCard`) doesn't render it.

## What to build

### 1. New component: `HRVReadinessCard.tsx`
Place under `src/components/analytics/`. Shown only when the user has at least 3 HRV data points in the last 14 days (otherwise hidden — same pattern as other cards).

**Sections:**
- Header: "HRV & Readiness" / "心率變異與訓練準備度", provider chip (same multi-provider switching as `HealthStatsCard`)
- Big readiness score (0–100) with colored label (Recovered / Balanced / Strained / Overreached)
- 7-day HRV sparkline using Recharts `LineChart` (last 7 entries, descending → re-sorted ascending), with shaded baseline band (mean ± 0.5·SD across last 60 days)
- Today's HRV value + 7-day average + delta vs baseline (e.g. "62 ms · 7d avg 58 · +4 vs baseline")
- Short explanation text (EN/ZH) describing what the score means

### 2. Readiness score formula

Based on the standard sport-science approach (Plews/Buchheit, HRV4Training, Whoop/Garmin Body Battery patterns) — using the **Ln(RMSSD) 7-day rolling mean vs 60-day personal baseline**, adjusted by RHR trend:

```text
1. baseline_mean   = mean( ln(hrv) ) over last 60 days (min 14 pts; fallback to all available)
   baseline_sd     = stdev( ln(hrv) ) over same window  (floor at 0.05 to avoid div/0)
2. recent_mean     = mean( ln(hrv) ) over last 7 days
3. hrv_z           = (recent_mean - baseline_mean) / baseline_sd          // typically -3..+3
4. rhr_baseline    = mean(resting_hr) last 60d
   rhr_recent      = mean(resting_hr) last 7d
   rhr_z           = (rhr_baseline - rhr_recent) / max(stdev_rhr, 1)      // higher RHR -> negative
5. composite       = 0.75 * hrv_z + 0.25 * rhr_z
6. readiness       = clamp( round( 50 + composite * 15 ), 1, 99 )
```

**Bands:**
- 80–99 Primed (green) — well recovered, can handle hard sessions
- 65–79 Balanced (emerald) — normal, train as planned
- 45–64 Moderate (amber) — recovery slightly below baseline, prefer easy/moderate
- 25–44 Strained (orange) — fatigue accumulating, easy day or rest
- 1–24 Overreached (red) — strong rest/recovery signal

This is a personalised z-score model — research consistently shows individual baselines outperform absolute thresholds for HRV-guided training (Plews 2013, Buchheit 2014, HRV4Training app).

### 3. Helper file: `src/lib/hrvReadiness.ts`
Pure functions:
- `computeReadiness(rows: TerraDailyHealthRow[]): { score, band, hrv7, baselineHrv, deltaPct, rhr7, rhrBaseline }`
- `getReadinessBand(score, lang): { label, color, description }`
- Selectors for the 7-day sparkline series (chronological)

### 4. Wire into UI
Mount `<HRVReadinessCard lang={lang} />` in `src/components/AnalyticsTab.tsx` directly below `<HealthStatsCard />` (or wherever the latter sits — confirm during build).

## Files to add / change

- ADD `src/lib/hrvReadiness.ts`
- ADD `src/components/analytics/HRVReadinessCard.tsx`
- EDIT `src/components/AnalyticsTab.tsx` — render new card
- (No DB / edge function / hook changes — existing hook already returns `hrv`)

## Out of scope

- Backfilling HRV for users on providers that don't currently send it (Garmin via Terra often omits HRV nightly avg)
- Pushing readiness into the AI coach prompt — can be a follow-up
- Storing computed readiness server-side (computed client-side from cached rows)
