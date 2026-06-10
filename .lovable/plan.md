## Goal

For AI plan days and Custom workouts only:
1. Let users add **multiple workouts per day** (e.g. AM easy + PM intervals).
2. Each workout can include **Warmup / Main / Cooldown** as ordered sub-steps, plus new top-level types **Warmup** and **Cooldown** for stand-alone short sessions.
3. **Auto-suggest pace and HR target** based on, in order of preference:
   - Past 30 days of running (computed VDOT from best recent efforts),
   - Falling back to AI plan target race time when recent data is insufficient,
   - HR (BPM) target always derived from profile age + max/resting HR zones.

Free preset plans are unchanged.

## Data model (no schema migration)

`training_plans.plan_data` is `jsonb`. Today each week-day holds a single workout with `{ type, distance_km, pace, description, ... }`. We extend the shape backward-compatibly:

```ts
type PlanDay = {
  date?: string;
  // Legacy summary fields (kept populated = sum of sessions, primary type of the day)
  type?: string; distance_km?: number; pace?: string; description?: string;
  // NEW
  sessions?: WorkoutSession[];                    // when present, this is the source of truth
};

type WorkoutSession = {
  id: string;                                     // local uuid
  time_of_day?: "AM" | "PM" | string;             // free label
  type: string;                                   // Easy Run, Intervals, Warmup, Cooldown, ...
  distance_km?: number; pace?: string; description?: string;
  hr_target?: { zone?: 1|2|3|4|5; bpm_low?: number; bpm_high?: number };
  steps?: WorkoutStep[];                          // optional warmup/main/cooldown breakdown
};

type WorkoutStep = {
  kind: "warmup" | "main" | "cooldown" | "recovery" | "interval";
  distance_km?: number; duration_s?: number;
  pace?: string; hr_target?: { bpm_low?: number; bpm_high?: number };
  reps?: number; note?: string;
};
```

Consumers that only read `day.type / distance_km / pace` keep working. New UI and the Terra push path read `sessions/steps` when present.

## Auto-suggest engine

New file `src/lib/paceSuggest.ts`:
- `estimateVdotFromRecent(activities, profile)` — scans last 30 days of runs, picks the best Daniels Running Score across distances, returns a VDOT.
- `vdotFromTargetTime(distance_m, seconds)` — uses existing `calculateRunningScore` in `src/lib/vdot.ts`.
- `suggestPaceAndHr({ type, vdot, profile })` — maps Easy / Tempo / Threshold / Interval / Long / Recovery / Warmup / Cooldown / Race Pace to a pace range (via `getMainPaces`) and an HR zone (via `zoneBoundaries`).
- Resolution order in caller: recent activities → target time → null.

## UI changes

### `src/components/training/EditWorkoutDialog.tsx`
- Accept `sessions` array; render a list of session cards with add/remove.
- Add **Warmup** and **Cooldown** to `TYPE_OPTIONS`.
- For each session: collapsible **Steps** section (warmup/main/cooldown) with the same fields.
- New **Suggest** button next to pace and BPM inputs → calls auto-suggest; fills value and shows source ("from last 30 days" / "from target time" / "from HR zones").
- When saving, also recompute the day-level summary (sum distance, primary type) so legacy reads stay correct.

### `src/components/TrainingTab.tsx` and `ProgramsTab.tsx`
- Calendar day cell renders a small stack when `sessions.length > 1` (dot per session, summed distance).
- Day detail view lists each session with its steps.
- "Add workout" button on a day that already has one → appends to `sessions`.
- Restrict the new affordances to AI plans and custom-added entries (Free plan rendering path untouched).

## Backend changes

### `supabase/functions/terra-push-workout/index.ts` and `terra-push-week/index.ts`
- If `day.sessions` exists, push one Terra planned workout per session (Terra has no "two workouts in one day" object; multiple pushes on the same date is fine).
- Map step `kind` to Terra `intensity` (warmup=1, cooldown=2, recovery=3, interval=4, main=5) and re-use `buildPlannedWorkout` step builders.

### `supabase/functions/_shared/terraPlannedWorkout.ts`
- Add `buildPlannedWorkoutFromSession(session)` that respects pre-built `steps`. Existing `buildPlannedWorkout(day)` keeps working for single-session days.

### `supabase/functions/generate-suggested-workout/index.ts` and AI plan generator (if any)
- When the model returns a day, allow it to emit `sessions[]`. Validate and coerce.

## Out of scope

- Free preset plans (`free_training_plans`) — left as single-session days.
- Watch push for warmup/cooldown step targets beyond what Terra already accepts.
- Migrating historical `plan_data`: not needed because the new shape is additive.

## Technical notes

- VDOT estimator caps at distance ≥ 1500 m efforts, ignores cross-training; uses `average_heartrate` for an HR-floor sanity check (rejects efforts below Z3 avg as "easy" candidates).
- Pace ranges shown to the user follow the existing `getMainPaces` ±band; HR ranges follow `zoneBoundaries`.
- All new code is TypeScript with shared types in `src/lib/planTypes.ts` (re-exported on the edge side via a small copy in `_shared/planTypes.ts`).

## Rollout order

1. `planTypes.ts` + `paceSuggest.ts` (pure functions, unit-testable).
2. `EditWorkoutDialog` multi-session + Suggest button.
3. Calendar/day rendering in TrainingTab and ProgramsTab.
4. Terra push: per-session pushing + step mapping.
5. AI plan generator: allow sessions[] output.
