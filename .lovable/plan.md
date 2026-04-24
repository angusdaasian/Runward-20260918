

## Fix Garmin native MFA loop

Apply the four-step fix to make the Garmin SSO ticket exchange succeed after MFA inside the Despia native app.

### Changes

**1. `supabase/functions/garmin-sso-start/index.ts`** — make the native `service` URL canonical
- Drop the self-referential `&serviceUrl=<encoded self>` suffix from `nativeServiceUrl`.
- Register Garmin with exactly: `https://<origin>/garmin-native-callback.html?deeplinkScheme=runward` and nothing else.
- Return that same canonical string as `native_service_url` in the response.

**2. `public/garmin-native-callback.html`** — send the canonical `serviceUrl` back, not a reconstructed one
- Stop building `serviceUrl` from `window.location.href` minus stripped params.
- Build it as `${origin}/garmin-native-callback.html?deeplinkScheme=${deeplinkScheme}` — byte-for-byte identical to what `garmin-sso-start` registered.
- Add a small visible status block ("Ticket received ✅ / Redirecting to app…") before firing the deeplink, so failures are diagnosable on screen.

**3. `src/pages/GarminMobileAuth.tsx`** — wait for Supabase session + show diagnostics
- Before invoking `garmin-sso-exchange`, poll `supabase.auth.getSession()` up to 6× every 500ms (3s total). If still no session, surface a clear "Session not loaded — please reopen the app and retry" error instead of a generic failure.
- Add a `diagnostics` state rendered in a mono-font card showing: ticket prefix, serviceUrl, session presence, exchange result.
- Delay the redirect to `/?tab=more&page=connect-apps` by ~2s on both success and failure so the user (and we) can see what happened.
- Pass `serviceUrl` through to the edge function unchanged (no re-encoding).

**4. `supabase/functions/garmin-sso-exchange/index.ts`** — log the exchange
- Log the truncated ticket, forwarded `serviceUrl`, and `user_id` before calling Railway.
- Log Railway's status + response body on both success and failure paths so we can read the exact CAS rejection reason in Edge Function logs.

**5. `src/hooks/use-garmin.ts`** — set pending flag before despia hand-off
- Call `setGarminSsoValue(GARMIN_SSO_KEYS.pending, "1")` immediately before `despia('oauth://?url=...')` so `ConnectApps` knows to look for a result on return.
- Add a single `console.log` of the native auth URL for debugging.

### Files touched

- `supabase/functions/garmin-sso-start/index.ts`
- `supabase/functions/garmin-sso-exchange/index.ts`
- `public/garmin-native-callback.html`
- `src/pages/GarminMobileAuth.tsx`
- `src/hooks/use-garmin.ts`

### After implementing

Both edge functions will redeploy automatically. Then test Garmin sign-in inside the native app. If it still fails, the on-screen diagnostics + Edge Function logs will tell us exactly which of the two suspected failures (serviceUrl mismatch vs. missing session) is actually happening — no more guessing.

