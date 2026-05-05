## Goal

Only mark splits as "Rest" when the activity is an **interval workout**. For easy runs, long runs, progressive runs, etc., every split is labeled "Run" — no rest rows.

## Detection logic (in `ActivityDetail.tsx`, intervals table)

Compute once per activity from the splits array, before rendering rows:

- `speeds` = lap `average_speed` values (>0)
- `hrs` = lap `average_heartrate` values (>0)
- `paceRatio = max(speeds) / min(speeds)` — how much faster the fastest lap is vs the slowest
- `hrSpread = max(hrs) - min(hrs)`

`isIntervalWorkout = paceRatio >= 1.6 OR (paceRatio >= 1.4 AND hrSpread >= 25 bpm)`

Rationale:
- Easy run: pace stays within ~10% (ratio ~1.1) — not interval
- Long run: maybe ~1.2 ratio — not interval
- Progressive run: ~1.3 ratio, smooth HR drift — not interval
- Interval session: work laps 4:00/km, recovery 7:00/km → ratio ~1.75, HR swings 40+ bpm — interval

## Per-row classification

Only when `isIntervalWorkout === true`, mark a split as Rest if:
- `average_speed < activity.average_speed * 0.7`, OR
- `distance < 200 m` (very short recovery jog lap)

Otherwise every row is "Run", numbered sequentially 1, 2, 3, ... and styled with the normal (non-muted) row look.

## Files

- `src/components/activities/ActivityDetail.tsx` — replace the IIFE inside the Intervals table (lines ~783–822) with the workout-type detection + gated rest classification described above.

No schema, no edge function, no other components affected.
