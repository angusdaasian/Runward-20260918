

## Switch Garmin Login to SSO Widget Popup Flow

Replace the email/password backend login with a popup that loads Garmin's real sign-in page (`https://sso.garmin.com/sso/signin`, the same page `connect.garmin.com/signin` redirects to). The user signs in on Garmin's actual page — Garmin handles the password, MFA, captchas, password resets, everything. We capture the SSO ticket from the redirect, exchange it for OAuth tokens on Railway, and store the tokens. **No more user passwords stored, no MFA prompt in our UI, no rate-limited backend logins.**

### How it works

```text
User clicks "Connect Garmin"
        │
        ▼
Frontend opens popup → https://sso.garmin.com/sso/signin?service=<callback>&...
        │
        ▼
User signs in on Garmin's real page (Garmin shows MFA / captcha if needed)
        │
        ▼
Garmin redirects popup → <callback>?ticket=ST-xxxxx
        │
        ▼
Callback page reads ticket, postMessage()s it to opener, closes itself
        │
        ▼
Opener calls edge function `garmin-sso-exchange` with the ticket
        │
        ▼
Edge function → Railway `/garmin-exchange-ticket` →
                garth exchanges ticket for OAuth1 + OAuth2 tokens,
                fetches Garmin profile (display name + email),
                dumps tokens to user's token folder, returns success
        │
        ▼
DB: garmin_connections row stored (no password, just display name + flag)
Sync proceeds as today.
```

### Changes

**1. Railway `main.py`** (you'll paste an updated file)
- Add `POST /garmin-exchange-ticket` body `{ ticket }` → uses `garth` to exchange the SSO ticket for OAuth1/OAuth2 tokens, fetches the authenticated user's Garmin display name + email from `/userprofile-service/socialProfile`, dumps tokens to `get_user_token_path(email)`, returns `{ success: true, email, display_name }`.
- Remove `/garmin-login` and `/garmin-login-mfa` (no longer used).
- `/garmin-activities` and `/garmin-activity-details`: stop accepting `password` fallback. Token-only. Return 401 with `{ detail: "reauth_required" }` when tokens are missing/expired so the frontend can re-trigger the popup.
- Add Railway **persistent volume** mounted at `/data/garmin_tokens` and set `GARMIN_TOKEN_PATH=/data/garmin_tokens` so tokens survive deploys.

**2. New edge function `supabase/functions/garmin-sso-start/index.ts`**
- Returns `{ url }` pointing at Garmin's SSO sign-in page with our callback as the `service` parameter:
  `https://sso.garmin.com/sso/signin?service=<callback>&webhost=https://sso.garmin.com&source=https://connect.garmin.com/signin&redirectAfterAccountLoginUrl=<callback>&redirectAfterAccountCreationUrl=<callback>&gauthHost=https://sso.garmin.com/sso&clientId=GarminConnect&locale=en_US`
  where `<callback>` is `https://<our-published-domain>/garmin-callback`.
- Server-side so URL params can change without a client redeploy.

**3. New edge function `supabase/functions/garmin-sso-exchange/index.ts`**
- Body `{ ticket }`. Authenticated. Calls Railway `/garmin-exchange-ticket`. On success, upserts `garmin_connections` with the returned email + display name (no password fields). Returns `{ success, display_name }`.

**4. Update `supabase/functions/garmin-sync/index.ts`**
- Remove `login` and `login_mfa` actions.
- `sync` no longer passes `password` to Railway. If Railway returns 401 `reauth_required`, surface that to the client so UI can re-trigger the popup.
- `disconnect` unchanged.

**5. New page `src/pages/GarminCallback.tsx`** (route `/garmin-callback`)
- Reads `?ticket=...` from URL, calls `window.opener.postMessage({ type: 'garmin-ticket', ticket }, location.origin)`, then `window.close()`. Shows a small "Signing you in…" spinner. Handles the error case (`?error=...`) by posting an error message instead.
- Add route in `src/App.tsx`.

**6. Rewrite `src/hooks/use-garmin.ts`**
- Remove `connect(email, password)` and `submitMfa(...)`.
- Add `connectViaPopup()`:
  - Call `garmin-sso-start` for the URL.
  - `window.open(url, 'garmin-sso', 'width=500,height=700')`.
  - Listen for same-origin `message` events with `type === 'garmin-ticket'`.
  - On ticket received, call `garmin-sso-exchange`. On success, run existing post-connect logic (clear Apple Health activities if present, auto-sync, toast).
  - Reject if popup closed without a ticket within 5 min.
- Keep `syncActivities()` and `disconnect()` mostly unchanged (sync surfaces `reauth_required` → re-prompts popup).

**7. Update `src/components/ConnectApps.tsx`**
- Replace email/password/MFA UI with a single **"Connect Garmin"** button that calls `garmin.connectViaPopup()`.
- Remove `garminEmail`, `garminPassword`, `mfaSessionId`, `mfaCode` state and the related inputs/warnings.
- Copy: "Sign in on Garmin's secure page. Garmin handles your password and 2-step verification — we never see them."

**8. DB migration**
- `ALTER TABLE garmin_connections` — make `password_encrypted` (or whatever the password column is named), `access_token`, `refresh_token` nullable. Existing rows untouched. New connections will leave them `NULL`.

### Files touched
- `supabase/functions/garmin-sso-start/index.ts` (new)
- `supabase/functions/garmin-sso-exchange/index.ts` (new)
- `supabase/functions/garmin-sync/index.ts` (simplify)
- `src/pages/GarminCallback.tsx` (new)
- `src/App.tsx` (add route)
- `src/hooks/use-garmin.ts` (rewrite)
- `src/components/ConnectApps.tsx` (replace UI)
- DB migration: nullable columns on `garmin_connections`

### What you need to do
- Update Railway `main.py` (I'll provide the full file when you approve this plan).
- Add Railway env var `GARMIN_TOKEN_PATH=/data/garmin_tokens` and mount a **persistent volume** at `/data/garmin_tokens`.
- Confirm `garth` ≥ 0.5 in `requirements.txt` (has the SSO ticket exchange helpers).

### Risks / notes
- **Popup blockers**: opened directly from the user's click handler so default popup blockers allow it. UI shows a hint if the popup fails to open.
- **Mobile web**: popups work on mobile Safari/Chrome but UX is a separate tab. A redirect-mode fallback for mobile/native shell can be added later.
- **Same-origin postMessage**: the callback page only `postMessage`s to `location.origin` — a malicious site cannot intercept the ticket.
- **Garmin ToS**: still an unofficial flow (just much more reliable than scraping passwords). Switching to the official Connect Developer Program later would not change the user-facing UX since it also uses a popup/redirect.

