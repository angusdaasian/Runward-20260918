# Prevent duplicate intervals and clear recalibration history

## Goal
Make recalibration enforce the training rules in code rather than relying only on Gemini, and let users clear accumulated history safely.

## Changes
- Add a deterministic schedule validator after Gemini returns its rebuilt weeks.
  - Allow at most one Interval session per week.
  - Never allow Interval sessions on consecutive days or immediately beside another hard workout.
  - Preserve an already completed/past Interval; if a new Interval conflicts with it, convert the new conflicting workout to Recovery.
  - When moving/replacing an Interval, replace the old conflicting slot with Recovery instead of leaving both sessions in the week.
  - Normalize the replacement’s title, description, distance, pace, sessions, and color so stale Interval details cannot remain.
- Run this validator before saving `plan_data_after`, so every manual and automatic recalibration follows the same invariant even if Gemini returns an invalid schedule.
- Add a “Clear history” action inside the expanded adjustment-history section, with confirmation and loading/error feedback.
  - Delete only rows for the signed-in user’s selected plan through the existing row-level security policy.
  - Keep the current training plan unchanged; this clears audit/history entries only.
  - Hide the undo action after its supporting history has been cleared.
- Add focused tests for duplicate intervals, back-to-back hard sessions, completed-current-week intervals, and safe history clearing behavior.

## Technical details
- Implement the schedule guard in the shared plan-adjustment helpers and invoke it after future-week stitching and before the adjustment record is inserted.
- Use the existing semantic workout colors and the existing Button/confirmation-dialog components.
- No database migration is required: `plan_auto_adjustments` already grants authenticated deletion and has an ownership-scoped delete policy.
