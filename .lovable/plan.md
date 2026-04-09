

## Implement Garmin Connection via Railway API

### Overview
Add a Garmin login card to the ConnectApps page. Users enter their Garmin email/password, which gets authenticated via the Railway API. On success, store the session data in the existing `garmin_connections` table and show a connected state.

### Changes

**1. `src/components/ConnectApps.tsx`**
- Replace the "ConnectIQ (Garmin)" coming-soon card with a functional Garmin card
- Add state: `garminConnected`, `garminDisplayName`, `garminEmail`, `garminPassword`, `garminLoading`, `garminError`, `showGarminForm`
- On mount, check `garmin_connections` table for existing connection (add to `checkConnections`)
- When not connected: show a "Connect" button that reveals email/password form
- On form submit: POST to `https://garmy-production.up.railway.app/auth` with `{ email, password }`
- On success (`success: true`): upsert into `garmin_connections` with `session_data` stored in `access_token` (JSON stringified), set `garmin_display_name`, show success toast
- On error (400/other): show toast with error message, display inline error
- When connected: show "Connected as [display_name]" with disconnect button
- Add disconnect handler: delete from `garmin_connections` where `user_id` matches

**2. No DB migration needed** — `garmin_connections` table already exists with appropriate columns and RLS policies (authenticated users can manage their own connections).

**3. Type casting** — Since `garmin_connections` may not be in the generated types file yet, use `.from("garmin_connections" as any)` or cast through `unknown` similar to the RaceTab pattern.

### Security Notes
- The Railway API call happens client-side (CORS must be enabled on the Railway backend)
- Garmin credentials are never stored — only the session_data returned by the API
- RLS policies already restrict users to their own garmin_connections rows

### UI Details
- Garmin card uses a teal/green accent color with a watch icon
- Email input (type="email") + password input (type="password")
- Loading spinner during auth
- Error message shown below form inputs
- Connected state shows display name + disconnect option
- Bilingual support (EN/ZH) for all labels and messages

