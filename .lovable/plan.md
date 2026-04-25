## Goal

1. Compute a **Training Load (TRIMP-style)** value for every activity (Strava / Apple Health / Garmin / COROS).
2. Show that value on the activity card.
3. Add a **Training Load chart** to the Activities tab showing weekly **Fitness (CTL) / Fatigue (ATL) / Form (TSB)** curves — same concept as araujo.zip, but bucketed weekly instead of daily/monthly.
4. Gate the whole Training Load feature (card badge + chart) behind **Premium**, with a locked teaser for free users.

---

## 1. Training Load formula (per activity)

We will use a duration × HR-intensity TRIMP approximation. This works for all sources because it only needs `moving_time` + `average_heartrate` (or a fallback).

```ts
// src/lib/trainingLoad.ts
export function computeTrainingLoad(act: {
  moving_time: number;          // seconds
  average_heartrate: number | null;
  max_heartrate: number | null;
  age?: number | null;          // from profile
  sport_type?: string;
}): number | null {
  if (!act.moving_time || act.moving_time < 60) return null;
  const minutes = act.moving_time / 60;

  // Resting HR assumed 60; max HR = profile max HR or 220 - age, fallback 190
  const hrMax = act.max_heartrate || (act.age ? 220 - act.age : 190);
  const hrRest = 60;
  const hrAvg = act.average_heartrate ?? hrMax * 0.7; // assume zone 2 if missing

  const hrr = Math.max(0, Math.min(1, (hrAvg - hrRest) / (hrMax - hrRest)));
  // Banister TRIMP weighting: y = 0.64 * e^(1.92 * HRR)  (men); use 0.86 * e^(1.67 * HRR) average
  const y = 0.75 * Math.exp(1.8 * hrr);
  const trimp = minutes * hrr * y;
  return Math.round(trimp);
}
```

This is the same "duration × HR intensity" approach araujo.zip describes.

**Implementation location:** computed on the **client** inside `useActivities` (memoized per activity) so we don't need to backfill DB rows or run any sync. We already have access to all required fields.

For Garmin activities, if `garmin_activities.training_load` is already populated from Garmin (column already exists per `types.ts:401`), prefer that value over the computed one.

---

## 2. Activity card update

In `src/components/ActivitiesTab.tsx` `ActivityCard`, add a new metric in the secondary stat grid (alongside Score / HR / Elev):

```tsx
{isPremium && load !== null && (
  <div>
    <span className="text-xs font-medium text-orange-500 block mb-0.5">Load</span>
    <div className="flex items-center gap-1">
      <Flame size={12} className="text-orange-500" />
      <span className="text-sm font-semibold text-foreground">{load}</span>
    </div>
  </div>
)}
{!isPremium && (
  <div className="opacity-60">
    <span className="text-xs font-medium text-muted-foreground block mb-0.5 flex items-center gap-1">
      <Lock size={10}/> Load
    </span>
    <span className="text-sm font-semibold text-muted-foreground">--</span>
  </div>
)}
```

Pass `isPremium` and a `load` value into `ActivityCard` (compute via `computeTrainingLoad` in the parent memo, just like `activityScores`). Same treatment in `ActivityDetail.tsx` stat grid.

---

## 3. Weekly Training Load curve component

New file: `src/components/activities/TrainingLoadChart.tsx`

**Algorithm (weekly buckets):**
1. Take all running/cardio activities from the last **26 weeks** (~6 months).
2. Compute each activity's TRIMP via `computeTrainingLoad`.
3. Group by ISO week (Mon–Sun), summing TRIMP per week → `weeklyLoad[]`.
4. Compute exponentially-weighted moving averages on the **weekly** series:
   - **Fitness (CTL)** = EWMA with time-constant **6 weeks** (≈42 days)
   - **Fatigue (ATL)** = EWMA with time-constant **1 week** (≈7 days)
   - **Form (TSB)** = `CTL - ATL`
5. Plot the three series with Recharts (already used in `ActivityDetail.tsx`):
   - X axis = week (label every 4 weeks: "Wk of MMM d")
   - Y axis = load points
   - Blue line = Fitness, orange line = Fatigue, red line = Form (with a green/red filled area between Form and 0 — green when Form > 0, red when Form < 0), matching the screenshot.
6. Header row shows current values: `Fitness X.X · Fatigue X.X · Form ±X.X`.
7. Status badge below chart based on TSB & CTL trend (last value vs 4 weeks ago):
   - `TSB < -10` → "Overreaching"
   - `-10 ≤ TSB < 5` and CTL trending up → "Productive overreach"
   - `TSB ≥ 5` and CTL trending up → "Building fitness"
   - `TSB > 15` and CTL flat/down → "Detraining / fresh"
   - `TSB ≈ 0` and CTL flat → "Maintenance"
8. Footer caption: "Fitness (CTL) = 6w EWMA · Fatigue (ATL) = 1w EWMA · Form = fitness − fatigue · Based on duration × HR intensity".

Bilingual (`lang` prop) for all labels.

---

## 4. Premium gating for the chart

Insert the chart in `ActivitiesTab` **between** "Recent Activity" and `SuggestedNextWorkout`:

```tsx
{isPremium ? (
  <TrainingLoadChart lang={lang} activities={activities} profileAge={profile?.age} />
) : (
  <TrainingLoadChartLocked lang={lang} />
)}
```

`TrainingLoadChartLocked` shows a blurred/skeleton version of the chart with a lock icon overlay and a "Upgrade to Premium" CTA that opens the existing upgrade flow (same pattern as `ActivityDetail.tsx` lines 832–834).

---

## 5. Files to create / edit

**Create**
- `src/lib/trainingLoad.ts` — `computeTrainingLoad()` + EWMA helper + weekly bucketing.
- `src/components/activities/TrainingLoadChart.tsx` — the curve component (premium view).
- `src/components/activities/TrainingLoadChartLocked.tsx` — locked teaser view.

**Edit**
- `src/components/ActivitiesTab.tsx`
  - Compute `activityLoads` map alongside `activityScores`.
  - Pass `load` + `isPremium` into `ActivityCard`.
  - Mount `<TrainingLoadChart />` / locked variant in the main view.
  - Also add Load metric inside the bottom-sheet date detail.
- `src/components/activities/ActivityDetail.tsx`
  - Add Training Load stat in the stat grid (premium-gated).

**No DB migration needed.** All computation happens client-side from existing fields. The existing `garmin_activities.training_load` column is used as-is when present.

**No edge function changes needed.**

---

## 6. Why weekly EWMA (not daily like araujo.zip)

User explicitly asked for weekly buckets. Daily EWMA would need a daily resampling. Weekly summed TRIMP + weekly EWMA (τ = 6w / 1w) gives the same Fitness/Fatigue/Form interpretation while staying readable on mobile and avoiding noisy single-day spikes.

---

## Out of scope for this iteration
- Backfilling a historical `training_load` column in the DB.
- Per-day training load chart.
- Trends panel ("last 4 weeks vs previous 4") shown on araujo.zip — can be added in a follow-up.
