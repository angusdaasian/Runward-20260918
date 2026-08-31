# Auto Program Adjust

Let the training plan adapt itself when the runner's actual training drifts from what was assigned — instead of the user manually editing days.

Example: plan says 18 km tempo, user runs 8 km easy. The system reads that as "bad day / life got in the way", and regenerates the remaining plan with Gemini instead of leaving a broken schedule behind.

## What exists today (verified)

- `training_plans.plan_data` holds `[{ week, startDate, days: [...] }]`; days follow `PlanDay` in `src/lib/planTypes.ts` (legacy `type`/`distance_km`/`pace` + optional `sessions[]`).
- `weekly-plan-review` already contains the exact matching engine needed: `fetchActivities` (merges Strava/Garmin/Terra/Apple + dedups by day), `fetchHealth`, and `scoreWeek` (planned vs actual km, completion %, pace score). It only *reports*, never edits the plan.
- `finetune-plan-week` already rewrites one week's `days` via Gemini, but is driven by HRV/RHR recovery data and requires the user to press a button and confirm.
- Activity ingest already fires webhooks on insert (`tg_trigger_cross_platform_dedup` uses `net.http_post` with a 60s debounce) — the same pattern can trigger adjustment.
- No deviation detection and no automatic plan rewrite exists anywhere.

## How it works

### 1. Opt-in
A toggle in the Training/Programs tab: **"Auto-adjust my plan"**, off by default. Stored per plan so a user can have it on for a marathon block and off otherwise. A short explainer states the plan may be rewritten automatically and that adjustments can be undone.

### 2. Deviation detection
After a run syncs (debounced), the system compares that day's assigned workout against what was actually done and classifies it:

```text
assigned 18km Tempo   actual 8km Easy    -> UNDERSHOT_HARD  (big miss on a key session)
assigned 10km Easy    actual 10km Easy   -> ON_TRACK        (no action)
assigned 12km Easy    actual 20km Long   -> OVERSHOT        (flag, risk of overreach)
assigned Rest         actual 14km        -> UNPLANNED_LOAD
assigned 16km Long    actual nothing     -> MISSED          (only after the day passes)
```

Signals used: distance ratio, run type (existing `classifyRun` / HR zones), pace vs assigned pace, and RPE if the user logged it. Deviation is only "actionable" when it clears a threshold (e.g. distance under ~60% or over ~140% of assigned on a key session, or a key session skipped).

### 3. Trigger rule
Adjustment does not fire on every wobble. It fires when:
- a **key session** (Tempo / Interval / Long) is significantly missed or downgraded, or
- two or more sessions in the current week deviate, or
- the week's cumulative volume is well under or over plan.

Guardrails: at most one auto-adjustment per rolling 72 hours, minimum one adjustment gap between runs, and a hard skip during the final taper weeks unless the miss is severe.

### 4. Regeneration with Gemini
A new `plan-auto-adjust` Edge Function builds the context — recent planned vs actual days, deviation labels, recovery data, race date, target time, weeks remaining — and asks Gemini to rewrite **only the remaining days**, with strict rules in the prompt:

- Never modify past days.
- Keep race date and target time fixed.
- Keep the weekly structure (same training days the user selected).
- Do not "make up" missed mileage by spiking the next week; cap week-over-week volume growth.
- If the miss looks like fatigue or illness, insert recovery before returning to intensity.
- Return the same day JSON shape so existing UI keeps working.

The response is sanitized field-by-field against the original days (same approach `finetune-plan-week` already uses) before it is written back.

### 5. Notification and undo
When an adjustment lands, the user gets a message through their existing channel (WhatsApp / Telegram / push) summarizing what changed and why, in their language. The previous `plan_data` is snapshotted, so an **Undo** button restores the old plan. An adjustment history list in the Training tab shows each change, the reason, and the trigger.

## Part 2: Full-program recalibration (one-off, user-triggered)

Auto-adjust only helps from the day it is switched on. For a runner already at week 9 of 12 with months of untracked drift, a separate **"Recalibrate my program"** action re-analyzes the whole block at once.

### What it does
1. **Audit every past week** in the plan against actual activities — per week and per day, label each assigned session `completed` / `partial` / `missed` / `overshot` / `substituted`, and roll it up into real numbers: actual weekly volume, key sessions actually hit, pace and HR trend, longest run achieved, current fitness (`recentVdot` from the existing engine).
2. **Reconcile the past** so the plan stops lying: past days are rewritten to record what actually happened alongside what was assigned, and the summary reads "week 6: 42 km assigned / 24 km done, long run missed" instead of showing a clean schedule that never occurred. Past *assignments* are preserved for honesty — the audit is written as actual-vs-assigned, not by silently overwriting history.
3. **Rebuild the remaining weeks** from the real starting point, not the original assumption — Gemini gets the full audit, current fitness, weeks left to race day, and target time, and regenerates weeks 9–12 with a realistic ramp from where the runner actually is.
4. **Report honestly on the goal.** If the achieved training no longer supports the original target time, the recalibration says so and proposes a revised realistic target (using the existing `predictRace` / VDOT engine) rather than quietly writing a plan that cannot deliver it.

### How the user experiences it
A button in the Training tab: **Recalibrate program**. It shows a preview first — an audit summary (weeks completed, volume achieved vs planned, missed key sessions), the proposed new remaining weeks, and any target-time revision — with **Apply** / **Cancel**. Nothing is written until the user applies. Fully reversible via the same snapshot + Undo mechanism as auto-adjust.

Guardrails: the ramp into the new weeks is capped so recalibration can never prescribe a jump the runner is not conditioned for, taper weeks stay protected, and race date never moves.

### Relationship to Part 1
Both features share the same engine — the adherence audit, the Gemini rewrite, the snapshot/undo, and the history log. The difference is scope and trigger: auto-adjust is a nightly single-day nudge, recalibration is an on-demand whole-block rebuild. Recalibration is the natural onboarding step *into* auto-adjust: run it once to clean up the past, then leave auto-adjust on so it never drifts that far again.

## Technical plan


**Database**
- `training_plans`: add `auto_adjust_enabled boolean not null default false`.
- New table `plan_auto_adjustments`: `id`, `user_id`, `plan_id`, `triggered_at`, `trigger_reason` (text), `deviation jsonb` (assigned vs actual detail), `plan_data_before jsonb`, `plan_data_after jsonb`, `summary_en`, `summary_zh`, `status` (`applied` / `reverted`), `created_at`. RLS scoped to `auth.uid()`, with `GRANT`s for `authenticated` + `service_role`.

**Shared logic**
- Extract the planned-vs-actual matching from `weekly-plan-review` into `supabase/functions/_shared/planAdherence.ts` (`fetchActivities`, `fetchHealth`, plus new `classifyDeviation` / `shouldAdjust`) and have both functions import it, so scoring stays consistent.

**Edge Function `plan-auto-adjust`**
- Modes: `evaluate` (detect only, no write — used for previews and testing), `run` (detect + regenerate + apply), `revert` (restore a snapshot).
- Auth: user JWT for manual calls; `x-webhook-key` for the automated path.
- Gemini via the existing Vertex helper (`buildVertexAuth`), `gemini-flash-lite-latest` for detection-side summaries and `gemini-3-flash-preview` for regeneration, `responseMimeType: "application/json"`, generous `maxOutputTokens`, and the existing truncated-JSON repair path.
- Debounce and rate limit checked against `plan_auto_adjustments` before doing any model call.

**Trigger**
- A nightly cron per user timezone window (HKT-aware, like the daily workout jobs) that evaluates active plans with `auto_adjust_enabled = true`. Nightly is preferred over firing on activity insert so a user logging two runs in a day gets one coherent adjustment, not two competing rewrites.

**Frontend**
- `ProgramsTab.tsx` / `TrainingTab.tsx`: the opt-in toggle, an "Auto-adjusted" badge on changed days, and an adjustment history sheet with Undo.
- Reuse `notifyPlanChanged()` after any apply or revert so the calendar and planned-workout views refresh.
- EN/ZH strings added to `src/lib/i18n.ts`.

## Decisions to confirm

- Premium-only, or available to free users? (`finetune-plan-week` is currently premium-gated.)
- Fully automatic, or "propose and ask" — send the suggestion and only apply after the user confirms (the existing `PlanSuggestionCard` pattern already does propose-then-apply)?
- Should overshooting (running much more than assigned) also trigger a rewrite, or only undershooting?
