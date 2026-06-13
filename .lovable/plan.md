## Situation

- RevenueCat customer `bb9d6ce3-989e-46a6-b6c1-1fea08c1b87f` renewed `com.despia.runward.monthly` (FATHER DAY 2026 offer) at 2026-06-13 03:00 UTC.
- Webhook hit the `no_matching_user` branch — no DB write — because that UUID is not in `auth.users`, `profiles`, or `premium_subscriptions`.
- RC history shows the customer was first seen 2026-05-02 02:16 UTC as an anonymous user (`$RCAnonymousID:49083048dd094bfca4c72b559e...`), then aliased to `bb9d6ce3-…` at 02:20 UTC when the trial started. No further aliases.
- None of the 6 Supabase users created between 02:10 and 02:30 UTC on 2026-05-02 match that UUID.

The aliased UUID was almost certainly generated client-side at trial time, before/without a Supabase auth session, and the user never completed signup under that id (or the row was hard-deleted).

## Plan

We can't recover the linkage from our side alone. To grant premium correctly we need a second identifier from RC. Two paths:

### Path A — Get the customer's email from RC (preferred)

1. In the RC customer page, scroll to **Attributes** and copy `$email` (or `$displayName`/`$appleSubscriberId`).
2. Look that email up in `auth.users` → get the real `user_id`.
3. Either:
   - Call RC `POST /v1/subscribers/{real_user_id}/alias` with `bb9d6ce3-…` as the alias body, then re-trigger the renewal webhook (RC dashboard → "Resend webhook"), or
   - Run a one-off SQL insert into `premium_subscriptions` for the real `user_id` with `plan='com.despia.runward.monthly'`, `expires_at` = RC's `expires_date` (~2026-07-13 03:00 UTC), `rc_entitlement='premium'`, then set `profiles.is_premium=true`. Simpler, no webhook replay needed.

### Path B — If RC has no email attribute

The user paid Apple but never linked an account in Runward. There is no Supabase user to grant premium to. Options:
1. Wait for them to email support → then apply Path A.
2. Do nothing — Apple still bills them; if they log in later, the app's `Purchases.logIn(user_id)` call will alias the new `user_id` onto this RC customer, and the next renewal webhook (or `check-revenuecat-status` call) will grant premium automatically.

### Optional hardening (separate follow-up, not for this ticket)

The `revenuecat-webhook` could log every `no_matching_user` event to a `rc_orphan_events` table (RC `app_user_id`, event type, product, original transaction id, timestamp). That would let us audit how often this happens and proactively reach out when emails appear.

## What I need from you to proceed

Open the RC customer page for `bb9d6ce3-989e-46a6-b6c1-1fea08c1b87f`, scroll to the **Attributes** section (below "App User IDs"), and paste the `$email` value here. Then I'll run Path A.
