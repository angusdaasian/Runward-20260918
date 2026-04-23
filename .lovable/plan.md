

## Fix: Weather widget returns "City not found" after security hardening

### Root cause
After enabling `verify_jwt = true` on `get-weather`, the Supabase gateway is returning **401 Unauthorized** before the request reaches our function code (confirmed via edge logs — every recent call is `GET | 401`). Two things are wrong:

1. **Raw `fetch` instead of SDK** — `WeatherWidget.tsx` builds the URL manually and attaches headers by hand. With `verify_jwt = true` the gateway is stricter, and the SDK's `functions.invoke()` is the supported path that handles headers correctly across guest/auth/refresh states.
2. **Guest users have no session** — on the landing page (and during the brief window before auth resolves) `session?.access_token` is `null`, so the widget silently fails with "City not found" instead of degrading gracefully.

### Changes

**`src/components/WeatherWidget.tsx`** — replace the raw `fetch` in `fetchWeather()`:
- Use `supabase.functions.invoke('get-weather', { body: { city } })` (POST style) **or** keep GET via `invoke` with query string.
- Switch to POST with `{ city }` in the body — simpler, no URL encoding edge cases, and `invoke()` attaches the right auth headers automatically.
- Distinguish error states: if no session → return a sentinel `"NO_AUTH"`; if invoke errors → `"FETCH_FAIL"`; if API returns no match → `"NOT_FOUND"`. Surface a clearer message ("Sign in to see weather" vs "City not found").

**`supabase/functions/get-weather/index.ts`** — accept POST too:
- Read `city` from JSON body when method is POST, fall back to query param for GET (back-compat).
- Allow `POST` in CORS `Access-Control-Allow-Methods`.
- Keep all existing auth + rate-limit logic untouched.

### Optional polish
- If the user is in guest mode on the landing page, hide the widget entirely instead of showing a broken button. (Skip if the widget is only mounted post-auth — quick check needed during implementation.)

### Files changed
- `src/components/WeatherWidget.tsx`
- `supabase/functions/get-weather/index.ts`

No DB migration, no config changes.

