## Problem

The April leaderboard ended but no codes were sent and XP was not reset because:

1. **`reset-season` was never invoked.** Edge function logs are empty, `used_codes` table is empty, and 21 users still have non-zero `monthly_xp` (max 37,371). There is no scheduler wired up — the function only exists as an on-demand HTTP endpoint.
2. **The function itself has bugs** that would have hurt even if it had run:
   - It queries `reward_codes.is_assigned = false` but then **deletes** the code instead of marking it assigned, and never sets `is_assigned`. With service-role bypass the delete works, but the `is_assigned` field is dead weight.
   - It uses `.single()` on the available-code lookup — if zero codes remain it throws (instead of `.maybeSingle()`), aborting the loop on the next iteration.
   - It selects `reward_codes.*` then inserts into `used_codes` — needs to confirm column shape matches.
   - It excludes the dev account (`angchenghk@gmail.com`) from the leaderboard RPC, but `reset-season` does **not** exclude them, so they could win a code.
   - The `profiles` update uses `.gt("monthly_xp", -1)` as a "match all" hack — fine, but fragile.
   - No idempotency — if cron fires twice in a month, codes get double-assigned.

## Fix

### 1. Schedule the job (pg_cron + pg_net)

Add a cron job that calls the `reset-season` edge function at **00:05 UTC on the 1st of every month**:

```sql
select cron.schedule(
  'reset-season-monthly',
  '5 0 1 * *',
  $$
  select net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/reset-season',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Service role key will be stored in a Postgres setting (`vault` or `app.settings`) so it isn't pasted in plaintext in the migration. Set `verify_jwt = false` for `reset-season` in `supabase/config.toml` so cron can call it without a user JWT (it's already service-role internally), OR keep JWT on and pass the service role token — I'll go with `verify_jwt = false` + an internal `WEBHOOK_AUTH_KEY` header check inside the function to prevent public abuse.

### 2. Harden `reset-season/index.ts`

- Add `WEBHOOK_AUTH_KEY` header check (reuse existing secret).
- Change available-code lookup to `.maybeSingle()` and bail cleanly when codes run out.
- Exclude the dev account (`angchenghk@gmail.com`) from winners, matching `get_leaderboard`.
- Add **idempotency**: skip if `used_codes` already has rows for the target `month_year`.
- Use a single transaction-style flow: mark code assigned (or delete) only **after** `used_codes` insert succeeds.
- Log each step (winner id, code assigned, errors) so future runs are debuggable.
- Add CORS headers for manual invocation.

### 3. Run the missed April reset manually

After deploy, invoke `reset-season` once via curl/edge-function tool to:
- Assign codes to April's top 10 premium + top 3 free users.
- Reset everyone's `monthly_xp` to 0 and rank to Bronze V.

I'll show you the result (codes assigned, winner list) before declaring done.

### 4. Add an admin "Run Season Reset Now" button (optional, recommended)

In `AdminPanel` / `RewardCodeManager`, add a button that invokes `reset-season` with the auth header, so you can trigger it manually if cron ever fails. Behind `has_role(uid,'admin')`.

## Files to change

- `supabase/functions/reset-season/index.ts` — harden + auth + idempotency
- `supabase/config.toml` — `verify_jwt = false` for `reset-season`
- New migration — schedule pg_cron job
- `src/components/admin/RewardCodeManager.tsx` — add manual trigger button
- One-time: invoke the function to process April

## Notes

- 499 unassigned codes available, plenty for this month.
- Cron runs in UTC; "month end" means rewards for month N are issued at 00:05 UTC on day 1 of month N+1, using `now()-1 month` to compute `month_year`. That matches the current code.
