## Goal

Add a fancy, shareable **Monthly Stats** card below the Monthly Overview calendar in the Activities tab. It shows the headline numbers for the currently-viewed month and a small typed-run breakdown derived from each activity's HR profile.

## Card contents

**Top — 4 stat tiles (for the viewed month):**
- Total distance (km)
- Number of runs
- Total time running (h m)
- Average weekly distance (km) — total / number of ISO weeks that overlap the month

**Bottom — Run-type breakdown** (fancy list, e.g. `5 × Easy`, `2 × Tempo`, `1 × Interval`, `1 × Long`):
Derived per running activity from the data already on `StravaActivity` (`distance`, `moving_time`, `average_heartrate`, `max_heartrate`) plus the user's HR zones from `profiles` (`max_heartrate`, `resting_heartrate`, `custom_hr_zones`, `age`) via existing `zoneBoundaries()` in `src/lib/hrZones.ts`.

Classification heuristic (no per-second samples needed — uses avg & max HR only):

```text
let maxZone   = zone bucket of max_heartrate
let avgZone   = zone bucket of average_heartrate
let durMin    = moving_time / 60
let km        = distance / 1000
let longestKm = max km across the month's runs

if (maxZone >= 5 || (maxZone === 4 && (max - avg) >= 25 bpm))     → Interval
else if (avgZone >= 4)                                            → Tempo
else if (km >= max(15, 0.75 * longestKm) && avgZone <= 3)         → Long
else if (avgZone <= 1 || (km < 4 && avgZone <= 2))                → Recovery
else                                                              → Easy
```

Fallback when HR is missing: classify by distance/pace only (Long if ≥ 75% of longest, Easy otherwise).

Render the list as colored chips using the existing zone palette from `ZONE_LABELS`, sorted by count desc.

## Sharing

Use the existing canvas helpers (`shareCanvasHelpers.ts`, `shareActivity.distributeImageBlob`) to add a `shareMonthlyStats.ts` that renders a portrait PNG mirroring the weekly-review look. Share button on the card triggers it.

## Files

- **New** `src/components/activities/MonthlyStatsCard.tsx` — UI card with the 4 tiles + chip list + share button.
- **New** `src/lib/runClassifier.ts` — `classifyRun(activity, ctx)` + `summarizeRunTypes(activities, ctx)`.
- **New** `src/lib/shareMonthlyStats.ts` — canvas-based PNG share.
- **Edit** `src/components/activities/ActivityCalendar.tsx` — hoist the viewed-month state up via a small `onMonthChange?(year, month)` callback so the card stays in sync.
- **Edit** `src/components/ActivitiesTab.tsx` — track viewed month, render `<MonthlyStatsCard>` directly under `<ActivityCalendar>`, pass profile HR fields already loaded.

## Out of scope
- Per-second HR sample re-fetching for higher classification accuracy.
- New translations beyond the basic EN/ZH strings used in the card.
