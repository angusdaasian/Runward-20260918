# Fix: free accounts getting full history on first watch connect

## What happened
Two new watch connections today (00:05 and 01:17 UTC) imported full history — 509 runs back to Apr 2024 and 91 runs back to May 2026 — even though neither account is premium. Free accounts should only get the last 30 days. Ownership filtering is working (no runs shared between accounts).

## Steps
1. **Find the gap** in `supabase/functions/stridee-sync/index.ts`: the first-connect backfill path apparently doesn't apply the 30-day cap for non-premium users (or the premium check fails/defaults to full history).
2. **Fix the cap**: on first connect, non-premium users get `days: 30` only; full history requires an active premium subscription (checked server-side).
3. **Clean up the two affected accounts** (one at a time, no parallel load):
   - 69319b95-d6da-4242-8cb4-bf4a032d53c7: delete imported runs older than 30 days, keep the recent ones.
   - 6b65b4ef-ae61-4e3c-9c89-ab9bb4ea09e5: same.
4. **Verify**: re-check both accounts' earliest run dates, confirm no cross-user duplicates, and confirm a fresh test import respects the cap.
5. **Changelog**: add a minor entry (x.N) describing it generically as a watch-sync history fix — no provider names.

## Technical details
- Tables: terra_activities, premium_subscriptions (plan/expires_at/is_trial), stridee_connections.
- Premium check must treat expired subscriptions as free.
- Cleanup done sequentially per the one-account-at-a-time rule.
