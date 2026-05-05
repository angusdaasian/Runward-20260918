## Goal
Fix Terra split pace/HR accuracy and add **lap time** to the splits table.

## Changes

### 1. Splits table — add "Time" column + fix pace (`src/components/activities/ActivityDetail.tsx` ~lines 743–785)

Update the header to 6 columns and add a time cell using `split.elapsed_time`:

```tsx
<div className="grid grid-cols-6 text-[10px] ...">
  <span>#</span>
  <span className="text-center">Dist</span>
  <span className="text-center">Time</span>
  <span className="text-center">Pace</span>
  <span className="text-center">Elev</span>
  <span className="text-center">HR</span>
</div>
```

Each row shows `formatDuration(split.elapsed_time)` (e.g. `3:45`, `13:55`).
Also remove the "snap to 1.00km" logic so 806m / 240m render as the real distance.

### 2. Splits pace — use real distance/time (`src/components/activities/ActivityDetail.tsx` ~lines 339–362)

For Garmin / Terra laps, prefer `distance ÷ elapsed` over Terra's `avg_speed` (which is a moving average and disagrees with what the watch shows):

```ts
let avgSpeed = (distance > 0 && elapsed > 0)
  ? distance / elapsed
  : Number(lap.avg_speed ?? lap.average_speed) || 0;
```

### 3. Activity-level pace (`supabase/functions/terra-webhook/index.ts` ~line 534)

Compute `average_speed` from real `distanceMeters / durationSeconds` when both exist; fall back to Terra's `movement_data.avg_speed_meters_per_second`. This makes the header pace match the watch.

### 4. HR — pass through raw lap HR
Lap-level HR already kept as raw decimal in `laps` JSON; UI rounds for display. Activity-level int rounding stays (DB column is `integer`, watches display rounded BPM).

## Files touched
- `src/components/activities/ActivityDetail.tsx`
- `supabase/functions/terra-webhook/index.ts`

No DB migration. No new secrets.
