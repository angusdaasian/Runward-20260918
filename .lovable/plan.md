## Goal

Add per-second HR time-series capture from Terra activity payloads, plot a true HR-over-time chart in ActivityDetail, and validate by syncing **only today's activities** for user `6hhxbmqfd7` (uuid lookup at runtime via `terra_connections`).

## 1. Schema migration

Add to `terra_activities`:

- `hr_samples jsonb` — compact array `[{ t: <int seconds from start>, bpm: <int> }, ...]`, downsampled to ≤1 Hz. Nullable, default `null`.

## 2. terra-sync edge function changes

`supabase/functions/terra-sync/index.ts`:

- Helper `extractHrSamples(a)`:
  - Source order: `a.heart_rate_data.detailed.hr_samples` → `a.heart_rate_data.detailed.hr_samples_data` → `a.heart_rate_data.samples`.
  - Per sample: prefer `timer_duration_seconds`, else `(timestamp - metadata.start_time) / 1000`. Read bpm from `bpm` or `heart_rate_bpm` or `heart_rate`.
  - Drop non-finite bpm or `t < 0`. Downsample to 1 Hz (last write wins per integer second). Cap 7200 entries.
- Helper `recomputeLapAvgHr(laps, samples)`:
  - For each lap, average bpm of samples with `t` in `[lapStartSec, lapEndSec]`.
  - Replace lap `avg_hr` only when ≥5 samples fall in window.
- Activity loop:
  - Compute `hrSamples`. If non-empty + laps present, recompute lap `avg_hr`.
  - Add `hr_samples` to upsert; preserve existing on re-sync (extend the `existing` select).

### Scoping for this test

Add two **optional body params** to terra-sync (admin-only, gated via `has_role(auth.uid(), 'admin')`):

- `targetUserId: string` — when set, use that user_id for the connections query instead of `auth.uid()`.
- `dayOnly: boolean` — when true, set `startStr = endStr = today (UTC YYYY-MM-DD)` to fetch only today's activities (skip daily/sleep/body branches in this mode to keep the call cheap).

Then invoke once:
```
supabase.functions.invoke('terra-sync', { body: { targetUserId: '<uuid of 6hhxbmqfd7>', dayOnly: true } })
```

Both params remain useful as admin tools after the test.

## 3. Frontend chart

`src/components/activities/ActivityDetail.tsx`:

- Read `hr_samples` from the activity row.
- When length > 10, render a recharts `LineChart` above the per-lap HR section:
  - X: elapsed `mm:ss`. Y: bpm, domain `[min-10, max+10]` clamped to `[40, 220]`.
  - Single smooth line, no dots.
  - `ReferenceLine` at each cumulative lap boundary from `laps[i].duration_seconds`.
- Keep existing per-lap HR display.

## 4. Validation

1. Run migration.
2. Deploy terra-sync.
3. Look up uuid for `6hhxbmqfd7` via `terra_connections`, invoke with `{ targetUserId, dayOnly: true }`.
4. Inspect today's activity row in `terra_activities`: `hr_samples` populated, lap avgs updated.
5. Open ActivityDetail, confirm chart matches Garmin shape.

## Files touched

- new migration: `terra_activities.hr_samples jsonb`
- `supabase/functions/terra-sync/index.ts`
- `src/components/activities/ActivityDetail.tsx`
- `src/integrations/supabase/types.ts` (auto-regenerated)

## Out of scope

- `garmin_activities` mirror — follow-up.
- Backfill beyond today / past 30 days — Terra API limit anyway.
- Rolling out broadly — only after this user validates.
