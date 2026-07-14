I confirmed `c7a7d1ca-c7bf-4288-bb9d-794006a04087` is Premium in both `profiles.is_premium = true` and `premium_subscriptions.expires_at = 2126-06-18`, so that user should have been excluded.

Plan:
1. Fix `send-broadcast-notification` so scheduled jobs cannot silently fall back to `audience=all`:
   - Accept both `message` and legacy `body`.
   - Accept both `lang` and legacy `langFilter`.
   - Reject promo/broadcast requests if `audience` is missing or invalid instead of defaulting to all users.
2. Add a safe test mode to the function:
   - `test_user_id` limits evaluation to one user.
   - `dry_run: true` returns the computed recipient count without calling OneSignal.
3. Deploy the updated edge function.
4. Run a dry-run test for user `c7a7...` with `audience=free_no_trial_this_month` and `lang=zh`:
   - Expected result: `recipients: 0`, proving Premium users are excluded.
5. Then send an actual test only if it is explicitly targeted as a test message to `c7a7...`, not through the free-user promo audience, so we do not repeat the mistake.
6. Check logs after testing to confirm the function reports the intended audience, language, and recipient count.