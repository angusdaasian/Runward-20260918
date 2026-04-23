

## Security Fixes — Plan

Apply four contained fixes from the audit: lock down the seed function, secure the weather proxy, restrict storage listing, and add Realtime RLS for Strava (in preparation for future athlete-limit approval).

### 1. Harden `seed-promo-banner` (Critical)
Currently `verify_jwt = false` + service role = anyone can create banners as any user.

- **`supabase/config.toml`**: change `[functions.seed-promo-banner] verify_jwt` → `true`.
- **`supabase/functions/seed-promo-banner/index.ts`**:
  - Validate JWT via `getClaims()` against the bearer token.
  - Look up caller's role via `user_roles` table; reject non-admins with 403.
  - **Ignore** the `created_by` field from the request body — always set `created_by = claims.sub`.
  - Add basic input validation: `ends_at` must be valid ISO and in the future; `caption`/`captionZh` capped at 500 chars; reject images >5 MB.

### 2. Secure `get-weather` proxy (High)
Unauthenticated → quota abuse risk on WeatherAPI.

- **`supabase/config.toml`**: change `[functions.get-weather] verify_jwt` → `true`.
- **`supabase/functions/get-weather/index.ts`**:
  - Require `Authorization: Bearer <jwt>`; validate via `getClaims()`.
  - Return 401 on missing/invalid token.
  - Add a lightweight per-user in-memory rate limit (e.g. 30 requests / 5 min) keyed on `claims.sub` to throttle abuse from a single account.
- **Client (`src/components/WeatherWidget.tsx`)**: confirm it already calls via `supabase.functions.invoke` (which auto-attaches the JWT). If it uses raw `fetch`, switch to `supabase.functions.invoke('get-weather', { ... })`.

### 3. Lock down storage bucket listing (Medium)
Public buckets `avatars` and `promo-banners` currently allow anyone to LIST every object path.

New migration on `storage.objects`:
- **Drop** any broad `SELECT … USING (true)` policies on these two buckets.
- **Add** narrow policies:
  - `avatars`: owners can manage their own folder (`auth.uid()::text = (storage.foldername(name))[1]`); public `SELECT` only on individual objects (no listing). Since `getPublicUrl` works without listing, this is safe.
  - `promo-banners`: only admins (`has_role(auth.uid(), 'admin')`) can `INSERT`/`UPDATE`/`DELETE`. Public can read individual files via `getPublicUrl` but cannot enumerate.

### 4. Realtime RLS for Strava tables (preparation)
Even though Strava sync is currently unused, prepare for athlete-limit approval.

New migration:
- Ensure `strava_activities` and `strava_connections` are **removed** from the `supabase_realtime` publication if currently included (prevents broadcast leaks while RLS-on-realtime is unconfigured).
- If realtime is desired later, the proper pattern is to add table-level RLS (already in place) plus filter subscriptions by `user_id` on the client. Document this in a code comment near the Strava client hooks.

### Technical Notes
- All edge function changes preserve existing CORS headers and response shapes.
- Migration includes `DROP POLICY IF EXISTS` guards so it's idempotent.
- After deploy, mark security findings #1, #3, #4 (and the Strava realtime item) as `mark_as_fixed` via `security--manage_security_finding`.
- No client UI changes required other than the optional `WeatherWidget` invoke check.

### Files Changed
- `supabase/config.toml`
- `supabase/functions/seed-promo-banner/index.ts`
- `supabase/functions/get-weather/index.ts`
- `src/components/WeatherWidget.tsx` (only if it uses raw fetch)
- New migration: storage policy tightening + realtime publication cleanup

