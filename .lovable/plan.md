## Goal

Remove dev/prod branching and run Strava on **production credentials only**. Support **multiple Strava apps** (each capped at 10 athletes today, raisable to 999 once your API is approved) so when app #1 fills up, new athletes are auto-routed to app #2, then #3, etc. Start with **Client ID 215250** as app #1.

## Architecture

### 1. New table: `strava_apps` (admin-managed)

```text
strava_apps
  id               uuid pk
  client_id        text unique     -- e.g. "215250"
  client_secret    text            -- stored encrypted-at-rest in Supabase
  verify_token     text            -- for webhook subscription
  subscription_id  bigint nullable -- Strava webhook subscription id
  max_athletes     int  default 10 -- you change to 999 when approved
  priority         int  default 0  -- lower fills first
  is_active        bool default true
  created_at, updated_at
```

RLS: only admins can read/write. Edge functions use service role.

Why a table (not secrets/code): you said you'll keep adding apps and bump the cap later — a table lets you do it from the admin panel without redeploys or new secrets per app.

### 2. New column on `strava_connections`

```text
strava_app_id  uuid references strava_apps(id)
```

Every OAuth connection records which app it was created under, so token refresh and webhook events route to the correct client_id/secret. Existing rows backfilled to the prod app (215250).

### 3. App selection logic (`_shared/strava-apps.ts`)

- `pickAvailableApp()` — picks the active app with the lowest priority that still has `count(strava_connections where app_id = …) < max_athletes`. Throws `ALL_APPS_FULL` if none.
- `getAppById(id)` — fetch credentials by app id (for refresh/sync/disconnect).
- `getAppBySubscriptionId(sub_id)` — for webhook routing.

### 4. Edge function changes

| Function | Change |
|---|---|
| `strava-auth` | Drop `environment` param. Call `pickAvailableApp()`. Embed `app_id` in OAuth `state`. If full → return error so UI can show "All slots full, try later." |
| `strava-callback` | Drop env logic. Read `app_id` from `state`. Use that app's `client_secret` for token exchange. Store `strava_app_id` on the new connection row. |
| `strava-sync`, `strava-activity-streams`, `strava-disconnect` | Drop env branching. Load the connection's `strava_app_id` → look up secret from `strava_apps`. |
| `strava-webhook` | Drop dev/prod token logic. On `GET` verify, accept any active app's `verify_token`. On `POST`, find connection by `owner_id`, then load its app's credentials for the refresh call. |

### 5. Admin UI: `StravaAppsManager`

In Admin Panel → new tab "Strava Apps":
- Table list: client_id, max_athletes, current usage (e.g. `7 / 10`), priority, active toggle.
- "Add app" form: client_id, client_secret, verify_token, max_athletes (default 10), priority.
- Edit row to update `max_athletes` (you set to 999 once approved) or `client_secret`.
- "Register webhook" button per app → calls Strava `POST /push_subscriptions` and saves the returned `subscription_id`.

### 6. Seed

Insert app #1 row with `client_id=215250`, `max_athletes=10`, using the **new** `STRAVA_CLIENT_SECRET_PROD` value you'll provide. (Your existing `STRAVA_CLIENT_SECRET_PROD` secret matches whichever Strava app you originally created — confirm it matches 215250, or I'll request an update.)

### 7. Cleanup

- Remove `environment` column usage from Strava code paths (column itself can stay for now to not break historical activity rows; we'll filter by `user_id` instead of env).
- `src/lib/environment.ts` stays for other features.
- Old `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` (dev) secrets can be deleted after rollout.

## Frontend impact

- `ConnectApps.tsx` "Connect Strava" button: no more env param sent. If backend returns `ALL_APPS_FULL`, show a clear message.
- New admin tab + manager component.

## Migration / rollout order

1. Create `strava_apps` table + RLS + grants + `strava_app_id` column.
2. Confirm `STRAVA_CLIENT_SECRET_PROD` belongs to client_id 215250 (or request update).
3. Seed app #1 row (Client ID 215250, max 10).
4. Backfill `strava_connections.strava_app_id = <app#1 id>` for all existing prod rows.
5. Deploy refactored edge functions + admin UI.
6. You add app #2 / #3 via admin UI as needed; bump `max_athletes` to 999 when approved.

## Open questions before I build

1. Does your existing `STRAVA_CLIENT_SECRET_PROD` secret belong to **Client ID 215250**? If not, I'll request a fresh secret value.
2. Should existing connections that were created under the **dev** app be force-disconnected (user must reconnect under prod app 215250), or kept as-is until they naturally re-auth? Reconnecting is cleaner but interrupts users.
3. OK with storing `client_secret` and `verify_token` in the DB (admin-only RLS, service-role access from functions)? Alternative is one Supabase secret per app, but that doesn't scale to "add apps from the UI."
