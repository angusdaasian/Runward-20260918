# Push AI plans to the user's watch (Terra Planned Workouts)

Premium users will be able to send their AI-generated training plan to their connected Garmin/Coros watch, both per-day and as a full upcoming week. Pace bands will be used as the on-watch target.

## Scope (confirmed)
- **Both** per-day "Send to watch" button **and** "Push week to watch" bulk button
- **Pace bands** as the watch target (±5–10 sec/km around the planned pace)
- **Premium only**
- Providers covered: **Garmin, Coros** (Terra only supports write-back to these + Hammerhead/TodaysPlan). Other providers show a tooltip "Connect Garmin or Coros to sync to watch".

## Backend

### 1. New table `pushed_workouts`
Tracks which plan-days were pushed so we can update/delete cleanly when the plan changes.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| plan_id | uuid | FK to training_plans |
| week_idx, day_idx | int | location in plan_data |
| terra_user_id | text | which connection it was pushed to |
| provider | text | GARMIN / COROS |
| log_id | text | returned by Terra (used for DELETE) |
| pushed_at | timestamptz | |
| day_signature | text | hash of distance/pace/type — lets us detect "stale" pushes |

RLS: user can read/delete own rows; edge functions use service role.
Includes GRANTs per project convention.

### 2. Edge function `terra-push-workout`
Input: `{ plan_id, week_idx, day_idx }` (or array for bulk).

Steps:
1. Auth user, load plan_data + day
2. Skip if `type === "Rest"` or `distance_km` missing
3. Look up active Terra connection where `provider in ('GARMIN','COROS')`
4. **Translate plan day → Terra steps**:
   - Easy/Long/Recovery: 1 step, `duration_type=1` (distance, meters), `target_type=6` pace band (±8 sec/km)
   - Tempo: warmup 1km easy + tempo block at pace + cooldown 1km easy
   - Intervals (parse `description` for `N×Dm @pace`): warmup + repeat wrapper (`type=1`, `reps=N`) with work step (distance target, pace target) + recovery step (time/distance, easy pace) + cooldown
   - Trail run: distance only, no pace target
   - Workout name = `title`, description = first line of `description`
5. `POST https://api.tryterra.co/v2/athlete/plannedWorkout?user_id=...` with headers `dev-id`, `x-api-key`, body `{ data: [{ name, description, steps }] }`
6. If a previous `pushed_workouts` row exists for that day with different signature → DELETE old `log_id` first
7. Insert/update `pushed_workouts` row with new `log_id`
8. Return `{ ok, log_id, provider }`

Rate-limit via existing `terra_sync_usage` table: max 20 pushes/day/user.

### 3. Edge function `terra-delete-workout`
Input: `{ pushed_id }`. Calls `DELETE /v2/athlete/plannedWorkout?user_id=...&workout_id=<log_id>`, then deletes the row.

### 4. Edge function `terra-push-week`
Input: `{ plan_id, week_idx }`. Iterates non-rest days, calls the same translator + Terra POST in a loop (single Terra call per day — Terra accepts array but per-day failure isolation is cleaner). Returns `{ pushed: n, skipped: n, failed: n }`.

## Frontend (`TrainingTab.tsx`)

### Per-day card
Add a small **"📲 Send to watch"** button next to the existing Edit button on each day row. States:
- Default: outline button
- Pushed: green check + "Synced to {provider}" + click to re-push (if day_signature changed) or remove
- Loading: spinner
- Non-premium: button hidden, lock badge with upgrade link
- No supported connection: disabled with tooltip

### Week header
Add **"Push week to watch"** button next to the existing week navigation. Confirms in a small dialog ("Push 5 workouts to Garmin?"), shows progress toast.

### Auto-cleanup
When user edits a day → existing edit flow + automatically re-push if it was previously pushed (so watch stays in sync).
When plan is regenerated → bulk delete all `pushed_workouts` for that plan, user re-pushes manually.

## Technical notes

- Terra payload uses fixed integer enums (`duration_type=1` distance, `target_type=6` pace, `intensity` 1=warmup/2=active/4=recovery/5=cooldown). I'll add a small `terraWorkoutEnums.ts` shared file documenting these.
- Pace target encoding: Terra expects `pace_low`/`pace_high` in **meters/second**. Convert from `mm:ss/km` → `1000 / (mm*60+ss)`. Add ±8 s/km band by default; tighter for intervals.
- Coros/Garmin can take up to a few minutes to sync to the watch after Terra accepts the payload (depends on the user opening the companion app). Mention this once in a tooltip.
- The plan is your complete response — implementation begins after approval.
