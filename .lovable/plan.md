# Smart interval detection

## What you'll get

Today a run's segment table only offers **Laps** (whatever the watch recorded, e.g. 400 m auto-laps) and **1 km**. Neither shows a workout like 5k–4k–3k–2k–1k as five reps.

A third view — **Reps** (智能) — appears automatically when the app recognises an interval workout. It reads the second-by-second data from the run and finds the real fast efforts, whatever length they are, plus the recovery in between:

```text
Int   Type        Time     Dist    Pace     HR
 --   Warm up     8:20     1500    6:12     138
  1   Rep  5 km   23:20    5000    4:40     162
 --   Rest        3:05      420    7:20     140
  2   Rep  4 km   18:36    4000    4:39     165
 --   Rest        2:50      380    7:27     142
  3   Rep  3 km   13:45    3000    4:35     168
  ...
 --   Cool down   5:10      900    5:45     145
```

Each rep gets a rounded label (5 km, 800 m, 1 mile) when its measured distance is within a few percent of a round number, otherwise the exact metres. Rest rows stay dimmed like they are now, and the totals row is unchanged.

The toggle sits where the Laps / 1 km buttons already are, and only appears when a workout is actually detected — an easy steady run keeps the two views it has today.

## How the detection works

New file `src/lib/detectIntervals.ts`, pure functions with no UI or data dependencies:

1. Build a speed series from `distance_samples` (`{t, d}` per second, already stored for Terra/Suunto runs), smoothed with a ~15 s rolling window.
2. Split fast from slow with a two-cluster threshold (1-D Otsu / Jenks over the speed histogram) rather than a fixed pace, so it adapts to any runner.
3. Require a real spread before declaring a workout: the fast cluster must be roughly ≥18% quicker than the slow cluster, and there must be at least 2 qualifying efforts.
4. Turn contiguous fast stretches into reps (minimum ~200 m and ~45 s) and contiguous slow stretches into rests (minimum ~15 s); blips shorter than that get absorbed into the neighbouring segment so a GPS wobble or a road crossing doesn't split a rep.
5. Label the leading slow stretch **Warm up** and the trailing one **Cool down** when each is ≥600 m; other slow stretches are **Rest**.
6. For each segment compute distance, elapsed time, average pace (interpolating exact time at the segment boundaries, same helper style as the existing exact-km code) and average heart rate from `hr_samples`.
7. Snap the displayed rep distance to a round target (200/400/600/800/1000 m, then every 500 m up to 20 km, plus 1609 m) when within 4%.

## Wiring it into the run detail screen

`src/components/activities/ActivityDetail.tsx`:

- Replace the `showKmSplits` boolean with a `splitView` state of `"laps" | "km" | "reps"`, keeping the existing Laps/1 km behaviour untouched.
- Add a `smartReps` memo that calls the detector with `activity.distance_samples` / `activity.hr_samples`.
- Render a third toggle button (`分段智能` / `Reps`) only when `smartReps` is non-null; default the view to Laps as today.
- Feed the detected segments into the existing table renderer as rows carrying `isRest` and an optional `label`, so styling, numbering, and the Σ totals row all keep working.
- The Share-splits menu gains the reps option when detection succeeded, sharing the detected reps instead of laps.

Runs without per-second data (Strava-only, Apple Health) simply won't show the new toggle.

## Verification

- Check the detector against user c7a7's 15.55 km run from today (per-second data confirmed present: 4896 samples, clear ~4:40/km efforts separated by very slow recoveries) with a small script, confirming it returns the 5k/4k/3k/2k/1k structure.
- Run the unit-test suite and typecheck.
