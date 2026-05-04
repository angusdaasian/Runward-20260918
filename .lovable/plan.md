## Goal
Add Terra API integration **inside the existing "Link to Fitness App" tab** (`ConnectApps.tsx`) as new connect options for Garmin / Polar / Suunto / Coros via Terra. The current Railway garminconnect flow stays fully intact for now — Terra entries are presented as separate items labeled "(Beta — Terra)" so you can test them while real users continue using the existing Garmin connection. Migration to replace Garmin/Coros happens later.

## Isolation guarantees
- **No changes** to: `garmin-credential-login`, `garmin-credential-mfa`, `garmin-sync`, `garmin-daily-health-sync`, `_shared/garminRailway.ts`, the daily 10am cron, or any reads/writes of `garmin_connections` / `garmin_activities` / `garmin_daily_health`.
- Terra runs entirely on **new tables** and **new edge functions**.
- The existing "Garmin Connect" card in the Fitness App tab is untouched. Terra appears as additional cards beneath it.

## Secrets to add (via add_secret)
- `TERRA_DEV_ID` = `runward-testing-SFwUKff5Pw`
- `TERRA_API_KEY` = (your `x-api-key`)
- `TERRA_SIGNING_SECRET` = from Terra dashboard (HMAC verification)

## New tables (migration)
1. `terra_connections` — `id, user_id, terra_user_id text, provider text, reference_id text, scopes text[], active bool default true, last_webhook_at, last_synced_at, created_at, updated_at`; unique `(user_id, provider)`; RLS user-owns + service-role full
2. `terra_activities` — provider-agnostic activity rows mirroring `garmin_activities` shape + `provider`, `terra_activity_id`; unique `(user_id, terra_activity_id)`; RLS user-reads + service-role full
3. `terra_daily_health` — `(user_id, provider, date)` unique with vo2max, resting_hr, sleep, steps; RLS user-reads + service-role full
4. `terra_webhook_events` — debug log of every Terra webhook payload (`type, terra_user_id, reference_id, signature_valid, payload jsonb, processing_error, received_at`); RLS admins-read + service-role full

## New edge functions
1. **`terra-auth-init`** (JWT) — body `{ provider }` → POST Terra `/v2/auth/authenticateUser?resource=<PROVIDER>` with `dev-id`, `x-api-key`, body `{ language: "en", reference_id: user.id }` → returns `{ auth_url }`
2. **`terra-webhook`** (public, HMAC verify) — handles `auth`, `activity`/`processed_activity`, `daily`, `sleep`, `deauth`, `access_revoked`. Always logs payload to `terra_webhook_events`, then upserts into the right table.
3. **`terra-sync`** (JWT) — for caller's active terra_connections, pulls last 30 days from `/v2/activity` and `/v2/daily`, upserts.
4. **`terra-disconnect`** (JWT) — calls Terra deauthenticate, marks `active=false`.

## UI changes inside the Fitness App tab (ConnectApps.tsx)
- Keep the existing **Garmin Connect** card (Railway) exactly as-is.
- Add a new section header: **"Beta — new connections (Terra)"** with a short note: *"Test the new universal connection. Won't affect your existing Garmin sync."*
- Add 4 new cards using the same visual style as the existing cards:
  - **Garmin (Beta — Terra)**
  - **Polar (Beta — Terra)**
  - **Suunto (Beta — Terra)**
  - **Coros (Beta — Terra)**
- Each "Connect" button calls `terra-auth-init({ provider })` and opens `auth_url` in a new tab.
- For each, if a row exists in `terra_connections` for that provider with `active=true`, show:
  - Last synced timestamp
  - **Sync now** button → `terra-sync`
  - **Disconnect** button → `terra-disconnect`
- These Terra cards are **not gated** by the existing `hasFitnessApp` mutual-exclusion check — Terra is parallel to Railway, so connecting Garmin via Terra does not block or unblock the existing Garmin/Strava buttons.
- Remove the "COROS — coming soon" placeholder card since Coros is now bookable via Terra Beta.

## Webhook + redirect URLs to register in Terra dashboard
- Webhook: `https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-webhook`
- Success redirect: `https://welcome-ward-start.lovable.app/?terra=success`
- Failure redirect: `https://welcome-ward-start.lovable.app/?terra=failure`

I'll print the exact values after deployment.

## Data flow during testing
- You connect via the new Beta cards → Terra webhook fires → rows land in `terra_*` tables.
- Reads in the existing app (analytics, calendar, XP, training score) keep using `garmin_*` / `apple_health_*` / `strava_*` tables — **unchanged**, so other users see no difference.
- You can verify Terra is working by reviewing `terra_activities`, `terra_daily_health`, and `terra_webhook_events` directly (or via a quick admin debug view if you want one — happy to add).

## Rollout order
1. Add the 3 Terra secrets
2. Run migration (4 new tables + RLS)
3. Deploy 4 edge functions
4. Update `ConnectApps.tsx` with the Beta section
5. You paste webhook + redirect URLs into Terra dashboard
6. You test Garmin / Polar / Suunto / Coros end-to-end
7. Later, separate task: switch the main app reads over to `terra_*` and retire Railway

## Open questions
1. Should the Terra Beta section be visible to **everyone** in production, or only to **admins** (you) for now? (Recommend admin-only until validated.)
2. Want a quick read-only "Terra debug" panel inside the Beta section showing latest activities + webhook events for the current user, so you can verify without opening Supabase? (Recommend yes.)