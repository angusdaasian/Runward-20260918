# Push AI Plans to Garmin & Coros (Terra Write API)

Terra supports writing **planned workouts** to Garmin and Coros (also Hammerhead, TodaysPlan) via `POST /v2/plannedWorkout`. Once written, the workout shows up in the user's device library and they can follow it step-by-step on their watch. We already have Terra connected for these providers, so we just need a translator + a push action.

## What we'll build

1. **Edge function `terra-write-workout`** — translates one or more days from a `training_plans.plan_data` entry into Terra's planned-workout JSON and POSTs it to Terra. Supports single-day push and "push entire week" / "push entire plan".
2. **DB table `pushed_workouts`** — tracks which plan day has been pushed to which provider, storing Terra's returned `log_id` so we can later delete/update.
3. **UI: "Send to watch" button** in `ProgramsTab` (and the day-detail view) — visible only when the user has a Terra Garmin or Coros connection. Lets them push a single workout, the current week, or the whole plan. Toast on success/failure.
4. **Optional: delete pushed workout** — small "Remove from watch" action that calls `DELETE /v2/plannedWorkout` with the stored `log_id`.

## Workout translation

Our plan day shape:
```
{ day, type, title, description, distance_km, pace, date }
```
Mapping to Terra's schema:

| Our type | Terra step `intensity` | duration | targets |
|---|---|---|---|
| Easy Run / Long Run / Recovery / Race Pace / Progression / Tempo | active (5) / cool (varies) | `duration_type=1` distance in meters (`distance_km*1000`) | `target_type=15` pace bounds (m/s) from `pace`, ±5% |
| Interval | parse `"800m x 6 at 4:00/km, rest 2:00 between sets"` → 1 warmup (warmup type) + repeat block with N sub-steps (work step distance + recovery step time) + cooldown | mix of distance + time | pace target on work step |
| Rest / Cross Training | skip (don't push) |

Top-level payload per workout:
```json
{
  "data": [{
    "name": "<title> (<date>)",
    "description": "<our description>",
    "exercise_type": "running",
    "steps": [ ... ]
  }]
}
```

For provider-specific tweaks Terra documents (e.g. Garmin vs Coros structure), we'll pass `data_provider=GARMIN` or `COROS` in the query string and use the "Adapted to Garmin" shape from the docs (nested step groups with `type=1` containers + `duration_type=9` reps for repeats).

## Edge function shape

`POST supabase/functions/terra-write-workout`
```ts
body: { plan_id: string, scope: "day" | "week" | "all", week?: number, day_index?: number, provider?: "GARMIN" | "COROS" }
```
Steps:
1. Validate JWT, load `training_plans` row (RLS via service role + `user_id` check).
2. Look up active `terra_connections` for user → pick Garmin/Coros (or use `provider` param).
3. Build workout payloads from `plan_data`.
4. For each: `POST https://api.tryterra.co/v2/plannedWorkout?user_id={terra_user_id}` with headers `dev-id`, `x-api-key`, body `{ data: [...] }`.
5. Upsert each returned `log_id` into `pushed_workouts(user_id, plan_id, week, day_index, provider, terra_log_id, pushed_at)`.
6. Return summary `{ pushed: N, failed: M, errors: [...] }`.

Reuses existing Terra env vars (`TERRA_DEV_ID`, `TERRA_API_KEY`) already set as secrets.

## UI changes (`ProgramsTab.tsx`)

- New small icon button on each non-rest day card → "Send to watch" (disabled if no Garmin/Coros Terra connection).
- Header action menu: "Push this week to watch" / "Push entire plan to watch".
- Show a small ✓ + provider badge on days already in `pushed_workouts`.
- On click → call `supabase.functions.invoke("terra-write-workout", { body })` → toast result.

## Files to add / change

- **new** `supabase/functions/terra-write-workout/index.ts`
- **new** migration for `pushed_workouts` table + RLS (user can read/insert/delete own rows)
- **edit** `src/components/ProgramsTab.tsx` (button + menu + state)
- **edit** `supabase/config.toml` — not needed (verify_jwt default works)

## Out of scope (for this iteration)

- Strava (Terra doesn't support write to Strava).
- Apple Health (no write path through Terra).
- Two-way sync of workout completion status (we already pull completed activities via `terra-sync`).
- Editing a pushed workout — we'll delete + re-push if user regenerates the plan.

## Open questions

1. Default scope on the button — push **single day** only, or offer "this week / entire plan" from day one?
2. Should we auto-push the next 7 days whenever a new plan is generated, or always require an explicit user action?
