

# Patch Apple Sign-In to Work on angustest.site

Make Apple Sign-In work on both `angustest.site` (current wrap) and `pacecalculator.fun` (next App Store build) until the new build ships.

## Code changes

**1. `src/components/Onboarding.tsx`** (line ~317)
Change the hardcoded Apple OAuth `redirectTo` from `"https://pacecalculator.fun"` to `window.location.origin`. This makes the start of the flow domain-aware so the edge function knows where to send the user back.

**2. `supabase/functions/apple-auth-callback/index.ts`**
Currently the success redirect forces `https://pacecalculator.fun` as the base URL even when the `state.redirect_uri` is a path. Change it so:
- An allowlist of trusted origins is honored: `https://pacecalculator.fun`, `https://www.pacecalculator.fun`, `https://angustest.site`, `https://www.angustest.site`.
- If `state.redirect_uri` is a full URL whose origin is in the allowlist → use it as the base.
- If it's a relative path → fall back to `pacecalculator.fun` (preserves current default for safety).
- Anything else → reject to `pacecalculator.fun` to prevent open-redirect abuse.
- Apply the same allowlist logic to the four error redirects (currently all hardcoded to `pacecalculator.fun`).

No other edge function or DB change is needed. The `apple-auth-start` function already passes `redirect_uri` through `state` correctly.

## Manual step you must do (outside Lovable)

In **Apple Developer Console → Identifiers → Service ID `com.despia.runward.web` → Configure Sign In with Apple**, add to the Return URLs list:
```
https://angustest.site/callback/apple
https://www.angustest.site/callback/apple
```
(The Supabase edge function URL stays as-is; these are only needed because Apple validates the *final* domain the user lands on.)

Without this step, Apple itself won't reject the flow (the callback goes to the Supabase function), but it's good hygiene for the trusted-origin allowlist on the frontend redirect.

Actually — re-checking: Apple only validates the `redirect_uri` sent to `appleid.apple.com/auth/authorize`, which is the Supabase edge function URL. The downstream redirect from the edge function back to `angustest.site` is not validated by Apple. **So no Apple Developer Console change is strictly required.** You only need it if you ever switch to direct browser-to-Apple-to-frontend flow.

## What this fixes

- New users signing up via Apple on the `angustest.site` wrap will land back inside the wrapped app with a valid session, complete onboarding normally, and get their Apple-provided display name saved.
- Existing users (like the 3 already affected) can sign in again on the wrap and complete onboarding. Their `display_name` will still be NULL because Apple only sends user info on the *very first* sign-in — that ship has sailed for them, but they'll be able to set it manually in their profile.

## What this does NOT fix

- Strava environment mismatch (`angustest.site` still flagged as `'dev'`). Out of scope per your request — you only asked for Apple Sign-In.
- Existing affected users' missing `display_name` (irrecoverable from Apple).

## Rollback

When the new App Store build pointing to `pacecalculator.fun` is live, no rollback needed — the allowlist gracefully covers both domains. You can optionally remove `angustest.site` from the allowlist later for cleanliness.

