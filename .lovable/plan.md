## Goal

Stop storing `client_secret` and `verify_token` as plaintext columns on `strava_apps`. Move both into **Supabase Vault** (`vault.secrets`, encrypted-at-rest with a project-managed key). The admin UI keeps the same UX, but the actual secret values are unreadable via direct Postgres SELECT or the Data API — only the service role (edge functions) can decrypt them.

## Architecture

### 1. Schema change on `strava_apps`

```text
-- new columns
client_secret_vault_id    uuid     -- references vault.secrets.id
verify_token_vault_id     uuid     -- references vault.secrets.id

-- existing columns (deprecated, will be dropped after migration)
client_secret  text   -- set to NULL after move
verify_token   text   -- set to NULL after move
```

We don't FK-link to `vault.secrets` (Supabase discourages it); we just store the UUIDs.

### 2. Two SECURITY DEFINER SQL functions

Vault tables are not exposed via PostgREST. We add two `security definer` Postgres functions, both restricted to `service_role` (called only from edge functions):

- `public.get_strava_app_secrets(app_id uuid)` → returns `(client_secret text, verify_token text)` by joining `strava_apps` → `vault.decrypted_secrets`.
- `public.set_strava_app_secret(app_id uuid, kind text, value text)` → upserts a vault secret (creates with `vault.create_secret` if no vault id yet, otherwise `vault.update_secret`), then writes the resulting `vault.secrets.id` back to `strava_apps.<kind>_vault_id`. `kind` is `'client_secret'` or `'verify_token'`.

`GRANT EXECUTE` to `service_role` only — admins cannot call these directly.

### 3. New edge function: `strava-app-secret`

Admin-only writer. Flow:
1. Validate JWT via `getClaims()`, then check `has_role(user_id, 'admin')`.
2. Validate body `{ app_id, kind, value }` with Zod.
3. Call `set_strava_app_secret` via service-role client.
4. Return 200.

The admin UI calls this function instead of writing `client_secret` / `verify_token` directly to the table.

### 4. Update `_shared/strava-apps.ts`

`hydrate(row)` no longer reads the plaintext columns. Instead, after fetching a row, it calls `get_strava_app_secrets(app_id)` via the service-role client and fills `client_secret` / `verify_token` from vault. Env-var fallback for legacy app 215250 stays as a safety net until vault is populated.

### 5. Admin UI changes (`StravaAppsManager`)

- Table list: replace plaintext columns with "Secret set ✓ / —" badges (we never load the value into the browser).
- Edit dialog: `client_secret` / `verify_token` inputs save via `supabase.functions.invoke('strava-app-secret', { body: { app_id, kind, value } })` instead of `update().eq()`. All other fields (max_athletes, priority, is_active, subscription_id, notes) still update directly via the table.
- Add app: first `insert()` the row to get an `id`, then call the secret edge function twice (client_secret + verify_token) if values were provided.

### 6. Backfill + cleanup

Migration steps:
1. Add new vault-id columns.
2. For every existing row that has a plaintext `client_secret` / `verify_token`, call `vault.create_secret(value, 'strava_app_<id>_<kind>')`, write the returned uuid into the new column, then `NULL` out the plaintext column.
3. Keep the plaintext columns in place but always-NULL for one deploy cycle (rollback safety). A follow-up migration will `DROP` them.

### 7. RLS / grants

- `strava_apps` keeps the existing admin-only policy. The plaintext columns being `NULL` means even a leaked admin SELECT shows nothing.
- The two SECURITY DEFINER functions are `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO service_role`. The admin client never has direct access to vault.
- `vault` schema stays as Supabase ships it (no policy changes).

## Files changed

- `supabase/migrations/<new>.sql` — schema + functions + backfill.
- `supabase/functions/strava-app-secret/index.ts` — new admin writer.
- `supabase/functions/_shared/strava-apps.ts` — read secrets from vault.
- `src/components/admin/StravaAppsManager.tsx` — invoke edge function for secret writes, hide values in UI.

## Risk / threat model after migration

| Attacker has | Can read client_secret? |
|---|---|
| Stolen admin user JWT | No (table columns are NULL) |
| Stolen service role key | Yes (by design — edge functions need it) |
| Direct Postgres connection (DB password) | Only with the project's Vault encryption key, which Supabase manages — practically no |
| Read-only DB replica dump | No (vault stores ciphertext) |

This matches the protection level of Supabase's recommended pattern for storing third-party API secrets.

## Rollout order

1. Approve migration → vault columns + functions land, existing plaintext secrets are moved into vault and nulled.
2. Edge functions auto-deploy (secret reads switch to vault).
3. Admin UI deploys (writes go through `strava-app-secret`).
4. After a week with no issues, follow-up migration drops the plaintext columns entirely.
