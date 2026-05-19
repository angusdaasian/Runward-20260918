## Diagnosis

`premium-terra-sync` failed with Terra `404 invalid user id` for `terra_user_id=157c9880-5221-4877-ba78-23b5ec3d7738` (user `c7a7d1ca…`).

The `terra_user_id` is real — `terra_activities` already has 62 rows for this user from the regular sync. The 404 happens because `pickEnvFromRequest` chose the **test** Terra credentials (the call came from `id-preview--*.lovable.app`), but the Garmin connection was registered in **prod** Terra. Test Terra has never heard of that user id, so it 404s.

## Fix

Stop guessing the Terra env from the request host inside `premium-terra-sync`. Instead, resolve it per connection and fall back gracefully.

### Step 1 — Try prod creds first, then test, per connection

In `supabase/functions/premium-terra-sync/index.ts`:

- Build two credential sets: `getTerraCreds("prod")` and `getTerraCreds("test")`.
- For each `terra_connection`, call Terra with **prod** creds first.
  - If response is `404` with `detail: "invalid user id"` (or any 404), retry once with **test** creds.
  - Use the env that returned 2xx for the rest of that connection.
- Record the env actually used in the per-connection result returned to the client (`env: "prod" | "test"`), so we can see it in logs/UI.
- Keep existing upsert + summary logic unchanged.

This makes the function robust regardless of which dashboard/preview triggered it, and matches the reality that a single Supabase user can in principle have connections in either env.

### Step 2 — Log clearly

Update the existing `[premium-terra-sync] …` logs to include the env that was tried and the final env that succeeded, e.g.:

```
[premium-terra-sync] GARMIN try=prod status=200 fetched=43
[premium-terra-sync] GARMIN try=prod status=404 -> retry test
[premium-terra-sync] GARMIN try=test status=200 fetched=43
```

### Step 3 — (Optional, follow-up, not in this change)

Longer-term cleanup so we don't rely on trial-and-error:

- Add a nullable `terra_env text` column to `terra_connections`.
- Have `terra-auth-init` write the env it used when creating the auth link.
- Have `terra-webhook` backfill `terra_env` on `auth` / `user_reauth` events.
- Then `premium-terra-sync` (and `terra-sync`) can read the env straight from the connection row instead of probing.

Flag this as a follow-up; not required to unblock the user.

## Files touched

- `supabase/functions/premium-terra-sync/index.ts` — prod-then-test fallback + clearer logs.

No DB migration, no client changes, no changes to `check-revenuecat-status` or `PremiumSyncButton`.

## Verification

After deploy, re-invoke `premium-terra-sync` from the preview as user `c7a7d1ca…`:

- Expect logs to show `try=prod status=200` for GARMIN.
- Expect response `results: [{ provider: "GARMIN", env: "prod", status: 200, fetched: N, upserted: N }]`.
- Spot-check `terra_activities` for new rows with `start_time >= 2026-01-01` for this user.
