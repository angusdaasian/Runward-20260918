## Goal

Add three new "share as image" flows that reuse the existing canvas-based share infrastructure in `src/lib/shareActivity.ts` (which already does native save / Web Share / download via `distributeImageBlob`):

1. Share a week of the AI training plan (Mon–Sun, with each day's workout details).
2. Share a weekly training review (scores + insight).
3. Share an activity's AI analysis (per-activity).

All three follow the same pattern: render a portrait PNG on `<canvas>` → call `distributeImageBlob(...)` (already exported) → success toast.

## What to build

### 1. New library: `src/lib/sharePlanWeek.ts`

- Export `shareTrainingWeek({ weekIndex, week: WeekPlan, lang, athleteName? })`.
- Canvas layout (1080×1920, brand styling matching existing share cards):
  - Header: "Week N · {startDate} → {endDate}" + Runward logo.
  - 7 day rows (Mon–Sun), each row:
    - Left: day name + date
    - Color chip / emoji from RUN_TYPES
    - Title (localized via `localizeTitle`)
    - Distance + pace
    - 1–2 lines of description (use `localizeDescription` — already exported logic in TrainingTab; lift the helper into `src/lib/planFormatting.ts` so it can be reused by both TrainingTab and the share lib).
  - Footer: app icon + URL.
- Reorder days so Monday is first (`days` is keyed by date, just sort by weekday Mon→Sun).

### 2. New library: `src/lib/shareWeeklyReview.ts`

- Export `shareWeeklyReview({ review, lang })` where `review` matches the `Review` interface in `WeeklyReviewModal.tsx`.
- Canvas layout:
  - Header: "Weekly Training Review" + week range.
  - Big overall score ring (reuse drawing math, or render simple circle + number).
  - 4 sub-score tiles: Distance / Pace / HR / Recovery with numeric values.
  - Completion %: `completed_runs/planned_runs · actual_km/planned_km`.
  - Insight paragraph (truncate / wrap to fit, max ~6 lines).
  - Footer branding.

### 3. New library: `src/lib/shareActivityAnalysis.ts`

- Export `shareActivityAnalysis({ activity, analysis, lang })`.
- Canvas layout:
  - Hero strip: activity name, date, distance / time / pace stat row (reuse formatters from `shareActivity.ts` — export the helpers or duplicate).
  - "AI Coach Analysis" heading.
  - Analysis paragraph (wrap, multi-page guard: cap at ~700 chars with ellipsis).
  - Optional "Next workout" block when `next_workout_en/zh` exists.
  - Footer branding.

### 4. UI hookup (frontend only, no business-logic changes)

- **TrainingTab (`src/components/TrainingTab.tsx`)**: add a small "Share week" button (icon `Share2`) near the current week header (both AI plan and custom plan branches). On click → call `shareTrainingWeek` with the currently displayed `WeekPlan` and `weekIndex`.
- **WeeklyReviewModal (`src/components/training/WeeklyReviewModal.tsx`)**: add a "Share" outline button next to the existing "Regenerate this week" button. On click → `shareWeeklyReview({ review, lang })`.
- **ActivityDetail (`src/components/activities/ActivityDetail.tsx`)**: in the AI analysis card, add a "Share analysis" button. On click → `shareActivityAnalysis({ activity, analysis, lang })`. (The existing share menu already shares the activity card; this is a separate analysis-only share.)

### 5. Shared helpers

- Extract `localizeTitle` / `localizeDescription` / `RUN_TYPES` / `TYPE_LABELS` from `TrainingTab.tsx` into a new `src/lib/planFormatting.ts` and re-import in TrainingTab + ProgramsTab + the new share lib. Pure refactor, no behavior change.
- All three share libs reuse `distributeImageBlob`, `fmtDistance`, `fmtPace`, `fmtTimeShort` from `shareActivity.ts` — export the formatters that are currently file-local.

## Out of scope

- No DB / edge-function changes.
- No new push notifications.
- No changes to Cantonese / language picker work.
- No changes to the existing per-activity share card or custom-share dialog.

## Technical notes

- Canvas font stack and brand colors should match `shareActivity.ts` (system fonts, dark card with light text, app icon + `pacecalculator.fun` footer).
- Bilingual labels (`lang === "zh"`) follow the same pattern as existing share code.
- All text wrapped via a `wrapText(ctx, text, maxWidth)` helper (duplicate the small one from `shareActivity.ts` or export it).
- Cap canvas height per share to keep image under ~2 MB; truncate long insights/analyses with `…`.
