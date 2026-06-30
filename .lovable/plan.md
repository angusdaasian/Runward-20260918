
## Goal

After a user connects a fitness provider, automatically pull the last 7 days of activities so `maybeTrainCoachOnce` runs immediately and the personalized coach is trained on real data.

## Status check (per provider)

| Provider | Auto 7-day backfill on connect today? | Action |
|---|---|---|
| Polar | ✅ `polar-callback` already invokes `polar-sync` with `since_days: 7` | None |
| Terra | ✅ `terra-confirm` already calls `/v2/activity?start_date=weekAgo&end_date=today&to_webhook=true` (the historical-data endpoint from the docs link) | None |
| Strava | ❌ | Fix |
| Suunto | ❌ | Fix |
| Intervals.icu | ❌ | Fix |

Terra and Polar are already correct — earlier analysis was wrong about Terra. No changes needed there.

## Strava gate status (answer to your question)

Queried `strava_apps`:
- 1 active app (`client_id 215250`), `max_athletes = 10`, `STRAVA_APP_RESERVED_SLOTS = 1` → effective limit **9**
- Currently **8** connections
- Next new user fills slot 9. The **10th** signup will be blocked by `ALL_APPS_FULL` ("Strava connection is hitting its limit…").

So yes, the gate is on and you have exactly **1 free slot** before new Strava connects start being rejected. You'll want a second approved app row added (or Strava bump approval) before that 9th user lands.

## Changes

### 1. `supabase/functions/strava-callback/index.ts`
After the successful upsert, fire-and-forget a 7-day activity fetch directly against Strava's `GET /api/v3/athlete/activities?after=<unix_ts_7d_ago>&per_page=50` (inline, since `strava-sync` requires the user JWT and the per-window args differ from what we need here). Upsert each into `strava_activities`, then call `maybeTrainCoachOnce(supabase, user.id)`. Errors logged but not surfaced — connection still succeeds.

### 2. `supabase/functions/suunto-callback/index.ts`
After the upsert, fire-and-forget call to `GET https://cloudapi.suunto.com/v2/workouts?since=<ms_7d_ago>&until=<now_ms>` using the new access token + `Ocp-Apim-Subscription-Key` (same pattern as `suunto-sync`). Upsert via the shared `workoutRow` helper into `suunto_activities`, then `maybeTrainCoachOnce`. Reference: [Suunto Workouts API](https://apizone.suunto.com/api-details#api=suunto-workout-api&operation=export-workout-fit) — uses the same `/workouts` listing endpoint we already use in `suunto-sync`.

### 3. `supabase/functions/intervals-callback/index.ts`
After the upsert, fire-and-forget call to `GET https://intervals.icu/api/v1/athlete/<athlete_id>/activities?oldest=<YYYY-MM-DD 7d ago>&newest=<YYYY-MM-DD today>&limit=200` using the fresh access token. Reuse `mapIntervalsActivity` to upsert into `intervals_activities`, then `maybeTrainCoachOnce`. (Intervals.icu's documented activities endpoint accepts `oldest`/`newest` date params — same pattern `intervals-sync` already uses.)

### 4. No changes to Terra or Polar.

## Behavior

- All backfills are fire-and-forget inside the callback (don't block OAuth response).
- All write through `service_role` Supabase client.
- All call `maybeTrainCoachOnce` after upsert so the personalized coach trains on first connect.
- Failures are logged via `console.error` only — connection state is not affected.

## Out of scope

- Touching the Strava 9-slot gate (separate task: add a second `strava_apps` row).
- Changing existing on-demand sync behavior in Activities tab.
- Apple Health (push-based, can't backfill from server).
