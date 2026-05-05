## Fix 1 — `terra-webhook` `auth` crash (the blocker)

**File:** `supabase/functions/terra-webhook/index.ts`

- Add `user: any` parameter to `processWebhook` signature.
- Pass `payload?.user ?? {}` from the `Deno.serve` call site (line ~640).
- Defensive: inside the `auth` branch, `const rawScopes = user?.scopes` already null-safe — no other change needed.

This restores the `terra_connections` upsert + 7-day activity backfill that currently throws `ReferenceError: user is not defined` on every Terra connect, which is why connecting Garmin/Coros/Polar/Suunto silently fails today.

## Fix 3 — `terra-auth-init` redirect URLs

**File:** `supabase/functions/terra-auth-init/index.ts`

Currently passes `body.success_url` / `body.failure_url` straight to Terra, even if empty — Terra then has nowhere to redirect after the user authorizes, so they're stuck on Terra's success screen and never returned to the app.

- Validate inputs; if `success_url` / `failure_url` are missing or empty strings, fall back to a sensible default that always works:
  - success: `https://pacecalculator.fun/terra-return?status=success`
  - failure: `https://pacecalculator.fun/terra-return?status=failure`
- Use `https://www.pacecalculator.fun` only if the request `Origin` header indicates www; otherwise the apex domain. Simpler: default to apex.
- Keep client-supplied URLs when present (so native deep links / preview URLs still work).

## Recovery for already-broken users

After deploy, run a one-shot to reconstruct `terra_connections` for the recent failed `auth` events from `terra_webhook_events.payload.user` (those rows have `processing_error: ReferenceError...` and contain the full `user` blob with `provider`, `reference_id`, `terra_user_id`). This avoids forcing the affected users to disconnect/reconnect again.

No DB migration. No new secrets. No client changes.
