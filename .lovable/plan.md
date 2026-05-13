## Add collapsible Program Header above the week card (AI plan)

A new section appears above the existing "WEEK X" card on the AI plan view. By default it shows only the title; tapping it expands to reveal program meta + this week's progress.

### Collapsed (default)
- Title: `{weeks}-week {distance} program` (e.g. "16-week Half Marathon program")
- Chevron on the right indicates expand/collapse

### Expanded
- **Week progress**: `Week {currentWeekIdx + 1} / {existingPlan.weeks}`
- **Target time**: `{existingPlan.target_time}` (formatted, e.g. "Target: 1:45:00")
- **Weekly distance**: `{completedKm} / {plannedKm} km` with a thin progress bar
- **Weekly time**: `{completedMin} / {plannedMin} min` with a thin progress bar

### Where the numbers come from
- `weeks`, `distance`, `target_time`, `weeks` (total) → `existingPlan` (already loaded from `training_plans`)
- `plannedKm` → sum of `currentWeek.days[].distance_km`
- `plannedMin` → sum of `distance_km × paceMinPerKm` for each day. Pace parsed from `day.pace` (e.g. "5:30") with a sensible fallback per `type` when missing.
- `completedKm` / `completedMin` → sum of activities whose `start_date / start_time` falls inside `[currentWeek.days[0].date, currentWeek.days[6].date]`. Uses the existing `useActivities()` merged list (Garmin + Terra + Strava + Apple Health) already wired into TrainingTab's neighbouring components.

### Distance label mapping
`5K` → "5K", `10K` → "10K", `HM` → "Half Marathon" / "半馬拉松", `FM` → "Full Marathon" / "全馬拉松", `custom` → "Custom" — reuse the existing `FREE_PLAN_LABELS` table at the top of `TrainingTab.tsx`.

### File touched
- `src/components/TrainingTab.tsx` — add a small `ProgramHeader` component, render it above the existing week card inside the AI-plan calendar block (around line 1793, before the `<div className="bg-card border border-border rounded-xl p-3 mb-4">` block). No backend / schema changes.

### Bilingual strings
EN/ZH for: "{n}-week {distance} program" / "{n} 週 {distance} 計劃", "Week X of Y" / "第 X 週 / 共 Y 週", "Target time" / "目標時間", "This week" / "本週", "km", "min".

### Out of scope
- Custom plan section (the request specifies AI plan only). Same component can be reused later if wanted.
- Persisting expand/collapse state across sessions (will use local component state).