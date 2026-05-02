# Fix: AI plan dates don't match calendar dates

## Root cause

When the AI generates a training program, the edge function asks Gemini to invent both the `day` label (Mon/Tue/...) and the `date` (YYYY-MM-DD) for every workout. Two problems result:

1. **The user's `startDate` is never sent to the AI.** The frontend (`TrainingTab.handleGenerate`) collects `startDate` from the date picker and posts it, but `supabase/functions/generate-program/index.ts` ignores it — the prompt only says "start from today working backward from race date." So Gemini picks its own start day.
2. **The AI's `day` label and `date` field can disagree.** The weekly plan view in `TrainingTab` renders each workout under a positional label (`DAY_LABELS[i]` = Mon, Tue, ...), while the calendar (`ActivityCalendar` via `fetchPlannedWorkouts`) uses the real `day.date` value. If the AI says `{day:"Mon", date:"2026-05-05"}` but May 5 is actually a Tuesday, the user sees "Recovery Run on Monday" in the plan but "Recovery Run on Tuesday" on the calendar — exactly the bug reported.

## Fix

Stop trusting the AI for dates. Compute every `date` deterministically on the server from the user's chosen `startDate`, and force the `day` label to match.

### 1. `supabase/functions/generate-program/index.ts`

- Accept `startDate` from the request body (already sent by frontend).
- Keep asking the AI for `week`, `day`, `type`, `title`, `description`, `distance_km`, `pace`, `color` — but tell it dates will be assigned by the system, so it can omit/ignore `date`.
- After parsing the AI JSON, walk every week and overwrite each `day.date` based on `startDate + (weekIndex * 7) + dayIndex`, and overwrite `day.day` with the matching `Mon..Sun` label. Also fix `week.startDate`.
- This makes the schedule always start exactly on the user-picked date and guarantees `day.day` matches the weekday of `day.date`.

### 2. `src/components/TrainingTab.tsx` (weekly plan view)

In the three places that render `currentWeek.days.map((day, i) => ...)` (lines ~812, ~965, ~1180, ~1316), replace the positional label with the real weekday derived from `day.date` so the plan view and calendar can never visually disagree even on legacy plans:

```ts
const dateObj = day.date ? new Date(day.date + "T00:00:00") : null;
const weekdayLabel = dateObj
  ? ["SUN","MON","TUE","WED","THU","FRI","SAT"][dateObj.getDay()]
  : (DAY_LABELS[i] || day.day?.substring(0,3).toUpperCase());
```

Use `weekdayLabel` instead of `DAY_LABELS[i] || day.day?.substring(0,3).toUpperCase()`.

### 3. (Optional cleanup) `ProgramsTab.tsx`

Same positional-label issue exists there. Apply the same `weekdayLabel` fix for consistency, even though `Index.tsx` currently mounts `TrainingTab`.

## Result

- New plans: dates always begin on the user's chosen start date and the weekday label always matches the actual date — calendar and plan view show the same workout on the same day.
- Existing/legacy plans: the plan view now derives its weekday label from `date`, so it visually matches the calendar even if the stored `day` label was wrong.

## Out of scope

- Not changing storage schema.
- Not regenerating existing plans automatically; users can re-generate to get correctly-dated plans.
