## Short answer

**No — `check-revenuecat-status` will not revoke the manual grant**, even though RC doesn't know about martin1993's Supabase UID yet.

That function calls `GET /v1/subscribers/{supabase_user_id}`. Since RC has no subscriber under `45e41f43-…`, it returns 404 → the function exits with `{isPremium:false, synced:false, reason:"not_in_rc"}` and **does not touch** `premium_subscriptions` or `profiles.is_premium`. Even on a non-404 "all expired" response, lines 185–214 explicitly preserve any still-valid local row.

**But** — adding the email as an attribute in RC does **not** alias the IDs. RC won't link `bb9d6ce3-…` ↔ `45e41f43-…` from email alone. Consequences if we stop here:

- Manual grant works today ✅
- Next renewal webhook (~30 days) still fires with `app_user_id=bb9d6ce3-…` → hits `no_matching_user` again → no auto-renewal in DB
- `check-revenuecat-status` will never sync (RC 404 for his UID)

## Plan: grant now + alias so it stays automatic

### 1. Insert the premium row (one-off)
```sql
INSERT INTO premium_subscriptions
  (user_id, plan, activated_at, expires_at, is_trial, rc_entitlement)
VALUES
  ('45e41f43-8d04-410a-99bb-d76b76dad63c',
   'com.despia.runward.monthly',
   '2026-06-13 03:00:00+00',
   '2026-06-27 03:00:00+00',   -- 14-day trial end
   true, 'premium')
ON CONFLICT (user_id) DO UPDATE SET ...;

UPDATE profiles SET is_premium=true
WHERE user_id='45e41f43-8d04-410a-99bb-d76b76dad63c';
```

### 2. Add a temporary admin edge function `rc-alias-admin`
- Auth: `WEBHOOK_AUTH_KEY` header
- Calls `POST https://api.revenuecat.com/v1/subscribers/bb9d6ce3-989e-46a6-b6c1-1fea08c1b87f/alias` with body `{ "new_app_user_id": "45e41f43-8d04-410a-99bb-d76b76dad63c" }`
- Uses existing `REVENUECAT_SECRET_KEY` secret

### 3. Call it once with curl
Once aliased, RC will:
- Send a `SUBSCRIBER_ALIAS` webhook (logged only)
- Send all future `RENEWAL` / `EXPIRATION` webhooks with `app_user_id` = martin1993's UID → webhook will resolve and write to DB automatically
- `check-revenuecat-status` from his device will start returning the live RC subscriber → sync works

### 4. Optional cleanup
Delete `rc-alias-admin` after we confirm the alias took, or keep it as an admin tool for future orphan customers.

### Why this works
RC aliases are bidirectional — any one of them can be queried and gets the same subscriber object. So once `45e41f43-…` is aliased to `bb9d6ce3-…`, the existing webhook and status-check code resolve correctly without any code changes to those two functions.