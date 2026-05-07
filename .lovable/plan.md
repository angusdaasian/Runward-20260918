## Root cause

Database check for user `c7a7d1ca-c7bf-4288-bb9d-794006a04087` (your test user), aggregated by month and source:

| Month | Garmin `running` | Garmin `track_running` | Terra (`8` = Run) | User-reported total |
|---|---|---|---|---|
| Jan | 222.3 km | 50.7 km | — | **273 km** ✓ |
| Feb | 182.0 km | 69.2 km | 54.8 km* | **251.2 km** ✓ |
| Mar | 203.3 km | 24.9 km | 30.0 km* | **228.2 km** ✓ |
| Apr | 20.0 km | — | 175.2 km | **195.2 km** ✓ |
| May | — | — | 37.0 km | **37 km** ✓ |

*Terra rows in Feb/Mar duplicate Garmin and get correctly removed by the existing dedupe filter in `use-activities.ts`.

The numbers match your figures exactly **once `track_running` is counted as running**. Today it isn't.

In `src/lib/trainingLoad.ts`, `runningTypes` contains:
```
Run, TrailRun, VirtualRun, Treadmill,
running, trail_running, treadmill_running
```
…but **not `track_running`**, which is what Garmin returns for your track sessions (and is a real Garmin sport type with 393 rows project-wide). The heatmap calls `isRunning(sport_type)` to decide whether to add distance to the year/month totals — so all your track-running km are silently dropped. That's the ~130 km gap (854 vs ~984).

## Fix

1. **`src/lib/trainingLoad.ts`** — extend the running sport-type set to include the remaining Garmin string variants we're seeing in the database:
   - Add `track_running` (393 rows, your case)
   - Also add `virtual_running` for completeness (Garmin uses snake_case alongside Strava-style PascalCase)
   - Apply the same additions to both `runningTypes` (used by `isRunning`) and the local `runningSports` set inside `buildTrendComparison` so trend comparisons stay consistent with the heatmap.

2. **No changes needed elsewhere.** The heatmap (`ActivityYearHeatmap.tsx`), `TrendsCard`, and `use-activities.ts` already route everything through `isRunning(sport_type)` — fixing the set fixes all three at once.

3. **Verification after the change** — re-check the same user; expected heatmap year total ≈ 984.6 km (273 + 251.2 + 228.2 + 195.2 + 37), monthly bars matching your figures.

## Note on non-running activities

This change only adds *more* running variants to the running set — strength_training, walking, cycling, swimming, hiking, badminton, etc. all stay excluded from analytics totals as we already agreed. The `Other` / cycling / walk activities in your data are not affected.
