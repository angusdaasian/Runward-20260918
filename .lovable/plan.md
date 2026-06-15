# Runward Developer Platform — v1 Plan

Goal: let approved third-party apps (1) authenticate Runward users via OAuth2, (2) read their activities via a small REST API, and (3) receive webhooks when new activities arrive. You approve every app manually. Hard rate limits protect the backend.

## Scope (v1)

Included:
- Developer portal UI (`/developers`) — request app, view status, see client_id/secret, manage redirect URIs, view webhook + rate-limit stats.
- Admin approval UI inside existing `/admin` panel.
- OAuth2 authorization-code flow with PKCE.
- 3 public endpoints: `GET /v1/athlete`, `GET /v1/activities`, `GET /v1/activities/:id`.
- Webhook subscriptions (one callback URL per app, Strava-style) with HMAC signing and retry.
- Rate limits: **200 requests / 15 min per app**, **2000 / day per app**, max **300 connected athletes per app** (you can raise per-app from admin).

Excluded (v2+): scopes beyond `activity:read`, write endpoints, wellness/health data, public app directory.

## User flow

```text
Developer                       You (admin)              Their users
---------                       -----------              -----------
1. Sign in to /developers
2. Click "Create app"
   (name, website, redirect URIs,
    webhook URL, contact email)
   -> status = pending
                                3. Review in /admin
                                   -> approve / reject
                                   approve -> status = active,
                                   client_id + secret issued
4. See credentials in portal
5. Implement OAuth + API
                                                         6. Click "Connect Runward"
                                                         7. /oauth/authorize page
                                                            shows scopes + Allow/Deny
                                                         8. Redirected back with code
                                                         9. App exchanges code -> token
                                                         10. App calls /v1/* with token
                                                         11. New activity in Runward
                                                             -> webhook POST to app
```

## Database (one migration)

Tables (all with standard timestamps + RLS):

- `oauth_apps` — `owner_user_id`, `name`, `description`, `website_url`, `contact_email`, `redirect_uris[]`, `webhook_url`, `client_id` (public), `client_secret_hash`, `status` (`pending|active|suspended|rejected`), `max_athletes` (default 300), `rate_limit_15min` (default 200), `rate_limit_daily` (default 2000), `webhook_verify_token`, `webhook_signing_secret`.
- `oauth_authorizations` — per `(app_id, user_id)`: `access_token_hash`, `refresh_token_hash`, `expires_at`, `scopes[]`, `revoked_at`. Unique on `(app_id, user_id)`.
- `oauth_auth_codes` — short-lived (10 min), single-use: `code_hash`, `app_id`, `user_id`, `redirect_uri`, `pkce_challenge`, `expires_at`, `used_at`.
- `api_rate_limit_buckets` — `(app_id, window_start_15min)`, `(app_id, window_start_day)` counters. Upsert + increment.
- `webhook_deliveries` — `app_id`, `user_id`, `event_type`, `payload jsonb`, `attempt`, `next_attempt_at`, `status` (`pending|delivered|failed|dead`), `last_response_code`, `last_error`.

Counters update via SQL function `consume_rate_limit(app_id)` that bumps both buckets and returns remaining + retry-after. Cheap, no Redis needed at this scale.

## Edge functions

- `developer-apps` — CRUD for the portal (developer-side; cannot change status).
- `admin-developer-apps` — admin approve/reject/suspend, raise caps.
- `oauth-authorize` — renders the consent page (or returns JSON for the SPA route `/oauth/authorize` to render).
- `oauth-token` — exchanges code → access+refresh token, also handles `grant_type=refresh_token`. Validates PKCE.
- `oauth-revoke` / `oauth-deauthorize` — user or app revokes.
- `api-v1` — single function, routes `/athlete`, `/activities`, `/activities/:id`. Validates bearer token, calls `consume_rate_limit`, returns 429 with `Retry-After` + `X-RateLimit-*` headers when over.
- `webhook-dispatcher` — pg_cron every minute, claims pending deliveries, POSTs with `X-Runward-Signature: sha256=...`, retries 1m / 5m / 30m / 2h / 12h, marks `dead` after 5 failures and emails the app owner.
- Hook into existing activity-ingest paths (strava-webhook, intervals-webhook, terra, suunto, polar, garmin) to enqueue a `activity.created` event per subscribed app whose user authorized them.

## Frontend surfaces

New routes (lazy-loaded in `App.tsx`):
- `/developers` — list of your apps, "Create app" button, per-app detail with credentials (secret shown once at issuance, then rotate-only), redirect URIs editor, webhook URL editor, recent rate-limit usage, recent webhook deliveries with retry button.
- `/oauth/authorize` — consent screen. Shows app name + logo + scopes + "Allow / Deny". Requires login.
- New tab in `/admin` → "Developer Apps" with pending queue and approve/reject actions.

All UI uses existing shadcn components + design tokens.

## Security

- Client secret shown **once** at approval, stored hashed (bcrypt). Developer can rotate from the portal (invalidates old).
- Access tokens: opaque random 32-byte, stored hashed, 6h TTL. Refresh tokens: 60d, single-use rotation.
- PKCE required for all flows (S256).
- HTTPS-only redirect URIs (except `http://localhost*` for dev).
- HMAC-SHA256 on every webhook with per-app `webhook_signing_secret`.
- Auto-suspend app if webhook fails 100x in 24h or rate-limit 429s exceed 50% of requests over 1h.
- Admin kill-switch on every app.

## Rate-limiting strategy

Per-app token bucket in Postgres (no Redis). On every API call:
1. `SELECT ... FOR UPDATE` the two bucket rows (15-min, daily) keyed by `(app_id, floor(epoch/window))`.
2. If under cap, increment and proceed. If over, return 429 with headers:
   - `X-RateLimit-Limit: 200,2000`
   - `X-RateLimit-Usage: 173,1240`
   - `Retry-After: <seconds>`
3. Webhook fan-out separately capped: max 20 in-flight POSTs per dispatcher run.

Athlete cap (`max_athletes`, default 300) enforced when issuing a new access token — return `error=athlete_limit_reached` if exceeded.

## Open questions

1. Webhook payload shape: minimal (`{event, object_id, owner_id}` like Strava, app must call back to fetch) or full activity JSON inline? Strava-style is safer (smaller, fewer privacy issues on retries).
2. Should the portal require a separate Stripe-style "developer agreement" checkbox before first app creation?
3. Public app directory now or later?

## Effort

~2 days of build for v1 (DB + 7 edge functions + 3 UI surfaces). Suggested order:
1. Migration + admin approval UI (you can manually issue an app to yourself for testing).
2. OAuth (`authorize` + `token`) + consent page.
3. `api-v1` + rate limiting.
4. Webhooks + dispatcher.
5. Developer portal polish.

If you approve, I'll start with step 1 (migration + admin queue) so you can self-issue a test app immediately.
