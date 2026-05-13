## Goal

Stop the AI from saying "no warmup/cooldown" when the runner logged warmup/cooldown as separate activities. Fetch any of the user's other activities that fall within 1 hour before the start time or 1 hour after the end time of the analyzed activity, and include them in the AI prompt as adjacent-session context.

## Where

`supabase/functions/analyze-activity/index.ts` — analysis branch only (skip for `translate` and `checkCacheOnly` modes). Edit happens just before the `systemPrompt` is built (~line 802, where `raceContext` is composed) so the new context can be appended.

## Logic

1. Compute the analyzed activity's window:
   - `mainStart = new Date(activity.start_date)`
   - `mainEnd = mainStart + (activity.elapsed_time || activity.moving_time) seconds`
   - `windowStart = mainStart - 60 min`
   - `windowEnd = mainEnd + 60 min`

2. Query the four activity sources for the same `user_id`, restricted to `start_date/start_time` between `windowStart` and `windowEnd`, excluding the current activity (by `activityDbId` for whichever table it came from):
   - `strava_activities` (start_date, distance, moving_time, average_speed, average_heartrate, name, sport_type)
   - `garmin_activities` (start_time, distance_meters, duration_seconds, average_speed, average_hr, activity_name, activity_type)
   - `terra_activities` (start_time, distance_meters, duration_seconds, average_speed, average_hr, activity_name, activity_type, provider)
   - `apple_health_activities` (start_date, distance, moving_time, average_speed, average_heartrate, name, sport_type)
   
   All four queries run in parallel via `Promise.all`.

3. Normalize each result to `{ start, end, distanceKm, durationSec, pace, avgHr, name, type, position }` where `position` is:
   - `"before"` if `start < mainStart`
   - `"after"` if `start >= mainEnd`
   - `"overlap"` otherwise (rare but possible — still include and label so the AI doesn't double-count)
   
   Sort chronologically.

4. Append a new section to `raceContext` (or directly to the user message) only if at least one adjacent activity was found:

   ```
   🔁 ADJACENT ACTIVITIES (logged separately within ±1h of this activity — treat them as part of the same training session, e.g. warmup or cooldown):
     • [BEFORE, 18 min before] 1.20 km easy 6:30/km, 8 min, HR 128 — likely warmup
     • [AFTER, 5 min after]    1.50 km 7:10/km, 11 min, HR 118 — likely cooldown
   → When evaluating warmup/cooldown adequacy and total session volume, include these. Do NOT say the runner skipped warmup/cooldown if a BEFORE/AFTER entry plausibly served that role.
   ```

   The "likely warmup / likely cooldown" hint is added only based on position; the AI makes the final call.

5. Both system prompts (EN and ZH) already cover warmup/cooldown only implicitly; no prompt edits required — the new context section is self-explanatory and instructs the AI directly.

## Out of scope

- No DB schema changes.
- No frontend changes — the client already passes `activity` + `activityDbId`; everything else is server-side.
- The cached-analysis fast path (`existingAnalysis && !forceRefresh`) is unchanged. Users who want the new behavior on an old activity can use the existing "force refresh" path.
- We do NOT modify warmup/cooldown detection inside the main activity itself (that's a separate concern handled by lap analysis).
