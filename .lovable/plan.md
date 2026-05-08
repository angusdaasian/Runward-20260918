## Verified against Terra's OpenAPI spec

Per Terra's docs, both `/v2/daily` and `/v2/sleep` responses (and their webhook payloads) carry the same `heart_rate_data.summary` object:

```json
"heart_rate_data": {
  "summary": {
    "avg_hr_bpm": 145,
    "avg_hrv_rmssd": 35.2,
    "avg_hrv_sdnn": 45.5,
    "resting_hr_bpm": 65,
    ...
  }
}
```

Our code only partially reads this. Two real bugs:

### Bug 1 — `terra-sync` `/v2/daily` branch ignores HRV
`supabase/functions/terra-sync/index.ts` lines 477–484 build the daily row with only `resting_hr` + `steps` + `vo2max`. It never reads `heart_rate_data.summary.avg_hrv_rmssd`, even though the spec says it's there. The earlier fix only patched the sleep loop.

### Bug 2 — `terra-webhook` sleep handler drops HRV + RHR
`supabase/functions/_shared/terraWebhookHandler.ts` lines 826–876 handles `type === "sleep"` and writes only `sleep_seconds` + `sleep_score`. Garmin sleep almost always arrives via webhook (cron `/v2/sleep` returns `items=0` after webhook delivery — confirmed in logs), so this is why every Garmin night in `terra_daily_health` has `hrv = null`.

Webhook `type === "daily"` already extracts HRV correctly (lines 799–802) — leave it.

## Changes

### 1. `supabase/functions/terra-sync/index.ts` — read HRV from `/v2/daily`

In the daily loop (around line 474):
- Extract `const dailyHrv = toFiniteNumber(d?.heart_rate_data?.summary?.avg_hrv_rmssd);`
- Add `hrv: dailyHrv != null ? Math.round(dailyHrv * 10) / 10 : null` to the `dailyByDate[date]` row.
- Update both `existing = dailyByDate[date] ?? { ... }` defaults (lines 509–513 in the body loop, line 572 in the sleep loop) so they include `hrv: null` consistently — already done in the sleep loop, just add to the body loop default.

### 2. `supabase/functions/_shared/terraWebhookHandler.ts` — extract HRV + RHR in sleep webhook

In the `type === "sleep"` branch (around line 869):
- `const sum = s?.heart_rate_data?.summary ?? {};`
- `const sleepHrv = toFiniteNumber(sum.avg_hrv_rmssd);`
- `const sleepRhr = toFiniteNumber(sum.resting_hr_bpm);`
- Extend the existing `existingSleep` select to also include `hrv, resting_hr`.
- Apply the same "longest-sleep wins" rule already used for `sleep_seconds`/`sleep_score`:
  - If `useNew`: prefer the new value, fall back to existing when null.
  - Else: only fill when existing is null.
- Add `hrv` (rounded to 1 dp) and `resting_hr` to the upsert payload.
- Add a log line `console.log(\`[terra-webhook] sleep ${appUserId} ${date} hrv=${sleepHrv} rhr=${sleepRhr}\`)` so we can verify in logs.

### 3. Backfill last 60 days for active Garmin users

After deploy, future webhook events will populate HRV. To fill historical rows, run a one-shot script via the agent shell that, for each active Garmin connection, calls Terra's `/v2/sleep?...&to_webhook=true` to re-deliver each night — the patched webhook will then write HRV/RHR.

(We won't rely on `terra-sync`'s `/v2/sleep` path because Terra dedupes range fetches once a webhook has delivered the record — that's why the current "sync" returns `items=0`.)

### 4. Verification

- Tail `terra-webhook` logs after deploy → look for the new `sleep ... hrv=…` log lines.
- `select date, hrv, resting_hr, sleep_seconds, sleep_score from terra_daily_health where provider='GARMIN' and user_id='c7a7d1ca-…' order by date desc limit 14;` → expect HRV 60–90 ms.
- Open Analytics → Performance: Daily Health card shows HRV value, HRV & Readiness card renders for Garmin.

## Out of scope
- Per-sample `hrv_samples_rmssd[]` storage — only nightly summary is needed for the readiness algorithm.
- `avg_hrv_sdnn` — current schema column is `hrv` (RMSSD), keep it that way.
