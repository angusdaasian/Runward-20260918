## Race Predictor (Premium)

Add a Race Predictor card to the Analytics → Performance tab. Predicts 5K, 10K, Half Marathon, and Marathon finish times from the user's current fitness, blended with their PB-based VDOT, and adjusted for forecast race-day weather.

### Where it lives
- New component: `src/components/analytics/RacePredictorCard.tsx`
- Mounted in `PerformanceTab.tsx` above `TrendsCard`
- 5K prediction visible to all; 10K / HM / Marathon blurred with a lock + "Upgrade" CTA for non‑premium (reuse `usePremium()` pattern from existing locked cards like `TrainingLoadChartLocked`)

### Inputs to the prediction
1. **Training Score** — current Running Score from `useActivities()` / profile (`profile.training_score`), representing recent fitness.
2. **PB-based VDOT** — for each row in `personal_bests`, compute a Running Score via `calculateRunningScore(distanceMeters, totalSeconds)` from `src/lib/vdot.ts`. Take the max across PBs.
3. **Effective VDOT** = weighted blend, e.g. `0.6 × trainingScore + 0.4 × bestPbScore` (fall back to whichever is available; if neither, show empty state "Add a PB or sync activities").
4. **Weather adjustment** — optional city input (default to user's last activity location or a manual city field). Call existing `get-weather` edge function for current/forecast conditions, then apply a heat/humidity penalty to predicted time.

### Weather adjustment model
Apply a multiplicative slowdown factor to the predicted time, based on heat index (temperature + humidity):

```text
heatIndex (°C)  | slowdown
< 13            | 1.00 (ideal)
13–18           | 1.00
18–22           | 1.01
22–26           | 1.02
26–30           | 1.04
30–34           | 1.07
> 34            | 1.10
```
Plus a small wind/rain note (display only, no math) — heavy rain/wind shown as an info chip.

### UI
- Card title: "Race Predictor" / "比賽預測"
- Top row: effective VDOT badge + small "based on training + PB" caption + city/weather chip (tap to change city)
- 4 distance rows (5K / 10K / HM / Marathon): predicted time, average pace, and a small delta showing weather impact (e.g. `+0:45 due to heat`)
- Premium-locked rows show blurred time + lock icon; tapping opens existing upgrade modal
- Loading skeleton while fetching weather

### Technical notes
- Reuse `predictTime()` and `formatTime()` from `src/lib/vdot.ts`
- Read PBs via `supabase.from("personal_bests").select(...).eq("user_id", user.id)`
- Use `usePremium()` from `PremiumContext` for gating; reuse `UpgradeModal` from `src/components/coach/UpgradeModal.tsx`
- Weather: call `get-weather` edge function (already exists); cache in component state; allow user to type a city
- All numbers computed client-side — no new edge function needed
- No DB schema changes

### Out of scope (per your answers)
- Future-date fitness projection
- Track distances
- Manual race-time entry override (training score + PBs already cover this)

### Files to create / edit
- create `src/components/analytics/RacePredictorCard.tsx`
- create `src/lib/racePrediction.ts` (weather adjustment + effective VDOT helpers)
- edit `src/components/PerformanceTab.tsx` (mount the card)
- edit `src/lib/i18n.ts` (new strings)