# Race-aware AI Program with Race Schedule

## Goal
Make the AI program generator consider the user's races from the **My Races** tab. Inside the generated AI program, add a collapsible **Race Schedule** section that lists all races within the plan window, highlights the goal race (priority A) the program is built around, lets the user edit priorities/remove races (synced both ways with My Races), and shows a "Goals changed — regenerate?" banner when My Races changes after generation.

## Schema change
Add to `training_plans`:
- `race_schedule jsonb default '[]'::jsonb` — snapshot of `[{user_race_id, race_name, race_date, category, priority}]` taken at generation time. Used to detect drift vs current `user_races`.

## Edge function `generate-program`
Accept new body field `races: Array<{name, race_date, category, priority}>` (already-filtered to plan window, sorted ascending). Inject a new section into the prompt:
- List each race with its date, category and priority (A/B/C).
- The **A race** = goal race the plan must peak for (use this as the existing `raceDate`/taper target).
- For each **B race** insert a mini-taper (1 reduced week before, easier 2 days post-race) and replace that day with a "Race" workout at race-pace.
- For each **C race** insert it as a "Race / hard training run" on race day, no special taper, easy day after.
- Keep existing 10% / 3:1 / final-taper rules; race-related deload weeks are exceptions to the +10% rule (allowed to dip).
- Mark race day entries with `type: "Race"`, title = race name, distance = category km.

## Frontend `TrainingTab.tsx`
1. **Initial generation** (`handleGenerate`): pull `userRaces` from `useActivities`, filter to `[startDate, raceDate]`, sort by date, send as `races`. The race chosen via the existing race picker becomes the implicit A race — set its priority to A in `user_races` if not already, so My Races stays the source of truth. Save snapshot to `race_schedule` column on the inserted plan.

2. **Regeneration** (`handleRegeneratePlan`): always re-pull current `userRaces` for the plan window, send to edge function, and refresh `race_schedule` snapshot.

3. **Drift detection** (computed in render): compare current `userRaces` window vs `existingPlan.race_schedule`. Diff considers added/removed race ids and priority changes. When diff is non-empty, show a banner inside the new Race Schedule section: *"Your race goals changed in My Races — regenerate to match"* with a Regenerate button calling `handleRegeneratePlan({})`.

## ProgramHeader: new "Race Schedule" sub-panel
Inside the existing collapsible header, below the existing fields, add a sub-section **Race Schedule** containing:
- Each race row: date · name · category badge · priority dropdown (A/B/C/none) · remove button.
- A-priority race row visually highlighted (primary border + "Goal race" tag).
- Editing priority calls a new prop `onUpdateRacePriority(raceId, priority)` which:
  - Updates `user_races.priority` in Supabase (same as RaceTab does).
  - Triggers `handleRegeneratePlan({})` to rebuild with the new priority distribution.
- Remove calls `onRemoveRace(raceId)` → delete from `user_races` → regenerate.
- Drift banner appears at the top of the panel when `racesDriftFromSnapshot` is true.

## Two-way sync with RaceTab
- Both panels read/write the same `user_races` rows. `useActivities` invalidation already broadcasts.
- After ProgramHeader edits, invalidate the `userRaces` query so RaceTab updates.
- After RaceTab edits, the next time TrainingTab renders it picks up the new races; the drift banner appears until user clicks Regenerate.

## Files touched
- `supabase/migrations/<new>.sql` — add `race_schedule` column.
- `supabase/functions/generate-program/index.ts` — accept + use `races` in prompt.
- `src/components/TrainingTab.tsx` — pass races on generation/regeneration, drift compute, ProgramHeader props, RaceSchedulePanel inside ProgramHeader.

## Out of scope
- Editing race date/distance from inside the AI program (user does that in My Races).
- Auto-regenerating silently on drift — user always confirms via the banner.
