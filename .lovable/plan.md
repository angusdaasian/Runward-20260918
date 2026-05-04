# Plan: Splits & route from Terra activities

## 1. `supabase/functions/terra-webhook/index.ts`

- Add helpers:
  - `encodePolyline(points)` — Google encoded polyline algorithm.
  - `extractGpsPoints(a)` — pulls `position_data.position_samples[]` (and known fallbacks) into `[lat, lng][]`.
  - `extractLaps(a)` — normalises `lap_data.laps[]` into `{ lap_index, start_time, end_time, duration_seconds, distance_meters, avg_hr, max_hr, avg_speed, max_speed, avg_cadence, calories, elevation_gain }` matching the lap shape Garmin activities already use.
- In the historical re-fetch (auth handler) call Terra with `with_samples=true` for the `activity` endpoint only (keep `false` for `daily` and `sleep` to limit payload size).
- In the activity handler upsert, also set:
  - `laps` = `extractLaps(a)`
  - `summary_polyline` = `encodePolyline(extractGpsPoints(a))` (null if empty)
  - `has_gps` = points.length > 0

## 2. `src/hooks/use-activities.ts`

- `fetchTerraActivities` already maps `summary_polyline` and `laps`; nothing else to change — the new columns will start populating once the webhook updates rows.

## 3. One-time backfill

- After deploy, trigger `garmin_backfill` again (re-auth or a manual fetch) so the existing 90 days of `terra_activities` rows get re-upserted with samples enabled. The webhook upsert is keyed on `(user_id, terra_activity_id)`, so existing rows update in place.

## Technical notes

- Terra v2 sample payloads can be large; we only request samples for `activity`, not `daily`/`sleep`.
- Polyline encoding is done server-side so the client stays unchanged and the existing Strava/Garmin map components render Terra activities the same way.
- Lap shape mirrors what `garmin_activities.laps` already stores so `ActivityDetail` renders splits without a code change.

## Out of scope

- No FIT-file parsing, no schema migration, no UI changes.
