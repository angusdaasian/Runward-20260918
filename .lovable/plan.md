## Goal
Treat non-running activities (bike, walk, hike, swim, strength, indoor cycle, etc.) as "non-analyzable" for distance-based analytics and activity detail charts/AI.

## Terra activity type mapping (verified from DB)
Sampled 311 type=`8` ("XX 跑步" / "Running") — clearly **Run**.
Other type numbers found, with example names:

| type | example names | sport |
|------|----|----|
| 8 | "Kowloon Running", "新界 越野跑" | Run / TrailRun |
| 58 | "跑步機", "Indoor Run", "室內跑" | **Run (treadmill)** — currently missing from map |
| 1 | "桃園區 騎乘", "New Territories Cycling" | Ride |
| 16 | "內湖區 公路車", "花蓮市 公路車" | Ride (road) |
| 18 | "室內自行車" | Ride (indoor) — missing from map |
| 7 | "九龍 步行", "Walking" | Walk |
| 130 | "信義鄉 登山" | Hike |
| 83 | "Pool Swim", "泳池游泳" | Swim |
| 80 | "肌力訓練", "Strength" | Strength (non-cardio) |
| 123 | "有氧運動", "Cardio" | Cardio (generic, not run) |
| 122 | "放鬆與專注" | Meditation/relax |
| 10 | "羽毛球" | Badminton |
| 78 | "樓梯機" | Stair climber |
| 35, 49, 84, 87, 100, 108 | misc | other |

I'll report these in chat after implementation so you can spot-check. Source: `terra_activities` table, grouped by `activity_type` + `activity_name`.

## Changes

### 1. `src/lib/trainingLoad.ts`
- Add `isRunning(sport_type)` helper recognizing: `Run`, `TrailRun`, `VirtualRun`, `Treadmill`, `running`, `trail_running`, `treadmill_running`.
- `buildTrendComparison`: only include activities where `isRunning(sport_type)` (currently includes all cardio).
- (Training load EWMA stays cardio-based — only distance/trends are running-only as requested.)

### 2. `src/components/activities/ActivityYearHeatmap.tsx`
- When tallying `distanceKm` (cell + monthly + yearly totals), only count running activities. Counts (`count`) and minutes can stay all-activity, OR also restrict — I'll restrict distance only since you said "total distance into the analytics chart".

### 3. `src/hooks/use-activities.ts` — Terra mapping
- Add `"58": "Treadmill"` and `"18": "Ride"` to `TERRA_ACTIVITY_TYPE_MAP` so treadmill runs are correctly classified as Run and indoor bikes as Ride (not defaulting to Run).
- Change unmapped-numeric fallback from `"Run"` to `"Other"` so types like 80 (strength), 123 (cardio), 122, 130, 10, 78 don't get miscounted as runs. Add explicit mappings for known ones: `80: "Strength"`, `83: "Swim"`, `130: "Hike"`, `123: "Cardio"`, `122: "Other"`, `10: "Other"`, `78: "Other"`.

### 4. `src/components/activities/ActivityDetail.tsx`
- Compute `const isRunning = ...` from `activity.sport_type`.
- If **not** running:
  - Hide the Intervals/Splits table (lines ~897–983) and the "Share splits" button.
  - Hide the AI Workout Analysis card and the Race-tag/Comment card (and "Share charts" button if it triggers AI).
  - Keep the heart-rate chart. Restrict the chart tab list to `heartrate` only (drop pace + altitude tabs) since pace is not meaningful and altitude pairs with running.
  - Add a notice box under the HR chart: "Non-running activities don't have detailed analysis." (zh: "非跑步活動不提供分析。")

## Out of scope
- Training load chart (CTL/ATL/TSB) keeps using all cardio as today — your request was about distance + trends only.
- Activity list/feed still shows all activities.

## Verification after implementation
I'll print the full Terra-type mapping I used so you can confirm nothing is misclassified.
