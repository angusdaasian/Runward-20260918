
Goal: make the Garmin iframe flow follow the working pattern from the GitHub issue so a successful Garmin login yields a service ticket instead of looping back to the Garmin sign-in screen.

1. Fix the SSO URL construction in `supabase/functions/garmin-sso-start/index.ts`
- Revert `gauthHost` to `https://sso.garmin.com/sso` instead of `/sso/embed`.
- Keep `service=https://sso.garmin.com/sso/embed`.
- Keep `source=<window.location.origin>`.
- Keep `consumeServiceTicket=false`.
- Trim the parameter set down to the proven working core and only retain clearly harmless UI options. The current URL has many extras, and one prior change already diverged from the known-good recipe.
- Return explicit diagnostics in the JSON response so the frontend can log the exact `service`, `source`, and `gauthHost` values being used.

2. Harden the iframe flow on the frontend
- Update `src/hooks/use-garmin.ts` to log the exact iframe URL returned by `garmin-sso-start` and the browser origin used to request it.
- Update `src/components/GarminIframeDialog.tsx` to:
  - keep the permissive `message` listener,
  - log iframe load/error state,
  - add a visible fallback action if no ticket arrives after login,
  - avoid assuming only one Garmin-origin message format.
- Preserve the current direct `onTicket -> garmin-sso-exchange` path, since the missing step is ticket delivery, not the exchange function itself.

3. Remove the mismatch between web routing and Garmin return URLs
- Review `src/lib/garminSso.ts`, `src/pages/GarminCallback.tsx`, and `src/pages/GarminMobileAuth.tsx`.
- Ensure any non-iframe fallback return URL lands on a route that actually renders the full app for web users.
- Today `/?tab=more&page=connect-apps` can be risky because `/` renders `Landing` on web, while the in-app connect screen lives inside `Index`. I’ll align this so any redirect-based fallback opens the app state reliably instead of dropping users onto the marketing page/onboarding.

4. Clean up stale hybrid logic so the iframe path is the single source of truth
- `ConnectApps.tsx`, `use-garmin.ts`, `GarminCallback.tsx`, and `GarminMobileAuth.tsx` currently contain a mix of iframe, popup, native, and redirect assumptions.
- I’ll separate:
  - desktop/web iframe flow,
  - native/mobile fallback flow,
  - legacy callback/popup code.
- That reduces conflicting behavior and makes it easier to tell whether a failure is Garmin-side or app-side.

5. Add explicit user-facing failure handling
- If Garmin returns to sign-in again or no `postMessage` arrives within a timeout, show a precise error:
  - third-party cookies blocked,
  - Garmin did not emit a ticket,
  - session not loaded,
  - exchange failed after ticket receipt.
- This avoids the current silent “stuck” state.

6. Validate end-to-end after implementation
- Confirm the start function emits the corrected SSO URL.
- Confirm the iframe either:
  - posts a ticket and triggers `garmin-sso-exchange`, or
  - shows a clear timeout/error state with diagnostics.
- Confirm fallback redirects land inside the app correctly on web and do not send users back to onboarding/marketing.

Technical details
- Most likely root cause in current code: `gauthHost` was changed to `https://sso.garmin.com/sso/embed`, but the working reference uses `https://sso.garmin.com/sso`. `service` should remain `/sso/embed`; `gauthHost` should not.
- Secondary issue: redirect-based fallback currently points to `/?tab=more&page=connect-apps`, but `/` renders `Landing` for web in `src/App.tsx`, while the real app UI is `Index` only when native detection says true or callback routes are used.
- Files involved:
  - `supabase/functions/garmin-sso-start/index.ts`
  - `src/hooks/use-garmin.ts`
  - `src/components/GarminIframeDialog.tsx`
  - `src/components/ConnectApps.tsx`
  - `src/lib/garminSso.ts`
  - `src/pages/GarminCallback.tsx`
  - `src/pages/GarminMobileAuth.tsx`
  - possibly `src/App.tsx` / `src/pages/Index.tsx` for fallback routing alignment
