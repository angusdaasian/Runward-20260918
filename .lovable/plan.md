

# Tap Calendar Date to View Activity or Planned Workout

Add tap interaction to the monthly calendar so users can see what they did or what's planned for any given date.

## Behavior

- **Tap a day with a Strava/Garmin/Coros/Apple Health activity** → opens a bottom sheet showing the activity summary (distance, time, pace, HR, elevation, calories where applicable). Includes a "View details" button that opens the existing full `ActivityDetail` view.
- **Tap a day with only a planned workout** → opens a smaller popover/sheet showing the plan: type (Easy, Tempo, Interval, etc.), planned distance, and the plan color dot.
- **Tap a day with both** → shows the activity summary (what actually happened) plus a small line "Planned: Tempo 10 km" underneath.
- **Tap an empty day** → nothing happens, no visual change. Day cell is not even given a hover/active style.

## Files changed

**1. `src/components/activities/ActivityCalendar.tsx`** — main change
- Accept two new optional props:
  - `onSelectActivity?: (activity: StravaActivity) => void`
  - `onSelectDate?: (info: { date: string; activity: StravaActivity | null; planned: PlannedWorkout | null }) => void`
- Build a `actByDate` lookup (date string → `StravaActivity`) alongside the existing `kmByDate`.
- Compute per-day `hasActivity` / `planned`. Wrap each day cell in a `<button>` only when one of them exists; otherwise render the existing inert `<div>`.
- On click, call `onSelectDate` with the resolved data.
- Add subtle visual affordance (cursor-pointer, slight scale on active) only on tappable cells.

**2. `src/components/ActivitiesTab.tsx`**
- Add `dateSheet` state: `{ activity, planned, dateLabel } | null`.
- Pass `onSelectDate` handler to `<ActivityCalendar>`. Handler sets the sheet state.
- Render a `<Sheet>` (from existing `@/components/ui/sheet`) anchored to the bottom containing:
  - Header: localized formatted date (e.g. "Mon, Apr 22").
  - If activity present: compact stats grid reusing the same fields as `ActivityCard` (distance, time, pace, HR, elevation, calories, score) + a "View details" button → calls existing `setSelectedActivity(activity)` and closes the sheet.
  - If planned present (with or without activity): "Planned" row with type label + distance + colored dot.
  - i18n via `lang === "zh"` ternaries, matching existing patterns.
- No changes to data fetching — `activities` and `plannedWorkouts` are already available.

## What this does NOT change

- No new DB tables, RLS, or edge functions.
- No changes to `ActivityDetail.tsx` — reused as-is for full view.
- Empty days remain visually identical to today (no extra borders/cursors).
- Calendar grid layout, legend, and month navigation unchanged.

## Edge cases handled

- Multiple activities on one day: pick the one with the largest distance (most representative). The sheet shows a subtle "+N more" hint and "View details" jumps to that primary activity. (Other activities remain accessible via the "See all" list.)
- Apple Health activities (no map, no polyline): stat grid omits map but shows calories, mirroring existing `ActivityCard` behavior.
- Future-dated planned workouts: still tappable, shows planned info.

