

## The Problem

Your Garmin credentials are sent as **URL query parameters** (`?email=...&password=...`) to the Railway service. This means the plaintext password is logged in Railway's HTTP access logs, visible to anyone with Railway dashboard access, and potentially cached by any proxy or CDN in between.

Additionally, credentials are stored in the `garmin_connections` table using misleading column names (`access_token` for email, `refresh_token` for password) — but the real issue is the transport method.

## The Fix

**Change all calls to the Railway Garmin service from GET with query params to POST with JSON body.** POST request bodies are not logged in standard HTTP access logs.

### Changes needed in `supabase/functions/garmin-sync/index.ts`:

1. **Login call** (~line 104): Change from `GET /garmin-activities?email=...&password=...` to `POST /garmin-activities` with `{ email, password, days }` in the JSON body.

2. **Sync call** (~line 144-150): Same change — POST with JSON body instead of GET with query params.

3. **Details call** (~line 195-200): Change from `GET /garmin-activity-details?email=...&password=...&activity_ids=...` to `POST /garmin-activity-details` with JSON body.

### Important caveat

This requires your **Railway Garmin service** to also accept POST requests with JSON bodies instead of (or in addition to) GET query parameters. If the Railway service is your own code, you'll need to update it too. If it only supports GET with query params, the edge function change alone won't work.

### Summary of edge function changes

- Replace all `new URLSearchParams(...)` + `fetch(URL?${params})` patterns with `fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({...}) })`
- Three call sites total (login, sync, details)

