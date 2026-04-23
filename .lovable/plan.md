

## Wire up Garmin MFA — minimal changes

**Goal:** Get the new Railway endpoints (`/garmin-login`, `/garmin-login-mfa`) working end-to-end. No DB schema changes, no UI redesign. Reuse existing `garmin_connections` row to store email+password as today (so token store on Railway disk does the heavy lifting).

### Changes

**1. `supabase/functions/garmin-sync/index.ts`**
- Replace the single `login` action with two actions:
  - `action: "login"` → POSTs to Railway `/garmin-login`. If response is `{needs_mfa: false}`, upsert `garmin_connections` and return `{success: true, needs_mfa: false}`. If `{needs_mfa: true, session_id}`, return `{success: true, needs_mfa: true, session_id}` **without** writing to DB yet (credentials held in memory by the client).
  - `action: "login_mfa"` (new) → body `{email, password, session_id, mfa_code}`. POSTs to Railway `/garmin-login-mfa`. On success, upsert `garmin_connections` with email+password and return `{success: true}`.
- `sync` action: unchanged endpoint URL (`/garmin-activities`), unchanged payload shape — Railway now uses stored tokens automatically, password is just a fallback.
- `disconnect`: unchanged.

**2. `src/hooks/use-garmin.ts`**
- Change `connect(email, password)` return type from `boolean` to `{ ok: boolean; needsMfa?: boolean; sessionId?: string }`.
- Add `submitMfa(email, password, sessionId, code)` returning `boolean`.
- On `needs_mfa: true`, do NOT toast success — let the UI prompt for code.

**3. `src/components/ConnectApps.tsx`**
- Remove the red "MFA not supported" warning box.
- Add MFA state: `mfaSessionId`, `mfaCode`.
- After `handleGarminLogin`:
  - If `result.needsMfa` → show a 6-digit code input below the password field (replace the email/password inputs with a "Enter code from Garmin email/app" input + Submit button).
  - Otherwise, behave as today.
- Add `handleSubmitMfa` that calls `garmin.submitMfa(...)` then runs the same post-connect logic (clear Apple Health activities if present, auto-sync, close form).
- Update copy: "Used to sign in to Garmin. Supports 2-step verification."

### Files touched
- `supabase/functions/garmin-sync/index.ts`
- `src/hooks/use-garmin.ts`
- `src/components/ConnectApps.tsx`

### Not touched
- DB schema (no `garmin_tokens` column — Railway's per-user token files handle persistence)
- Existing `sync` / `disconnect` flows
- UI styling beyond the new MFA code input

