## Problem

`POST /functions/v1/analyze-posture` returns **401 Unauthorized** with body `{"error":"Unauthorized"}` even when called with a valid logged-in user token. Confirmed by direct curl against the deployed function — the request never reaches the function code (edge logs only show `shutdown` events, no boot/invocation).

## Root cause

`supabase/config.toml` does not contain an entry for `analyze-posture`, so it falls back to the platform default `verify_jwt = true`. With the project on the new signing-keys system, the Supabase gateway is rejecting the user JWT before it ever reaches the function. Other working functions in this project (`get-weather`, `terra-webhook`, `weekly-plan-review`, `reset-season`, etc.) all have `verify_jwt = false` and validate the JWT in code instead.

`analyze-posture/index.ts` already does proper in-code auth via `sb.auth.getClaims(token)` (lines 60–75), so disabling gateway verification is safe — auth is still enforced.

## Fix

Add a single block to `supabase/config.toml`:

```toml
[functions.analyze-posture]
verify_jwt = false
```

No code changes needed. After deploy, verify with a logged-in curl that the function returns 200 (or a proper non-401 error from the AI step) instead of the gateway 401.

## Out of scope

- No changes to the function logic, CORS, or call sites in `PostureTab.tsx` / `PostureResults.tsx`.
- The earlier Terra auth-init improvement (store `terra_user_id` at init + 7-day backfill) is a separate task — not included here.
