## Problem

The "refresh" button on the Daily Health card (Analytics → Performance) calls the `terra-sync` edge function, which always fetches **activities + daily + sleep** for every active Terra connection. The screenshot shows it triggering many `Activity` webhook-style fetches on Terra. It should only refresh sleep, resting HR, VO₂max and sleep score.

## Fix

Add a `healthOnly` flag to `terra-sync` and have the UI pass it.

### `supabase/functions/terra-sync/index.ts`
- Parse `healthOnly: boolean` from the request body (default `false`, preserving existing scheduled/full-sync callers).
- Wrap the `// activity` block (the `fetch /v2/activity` loop, terra_activities upsert, and `deleteMatchingGarminDuplicate` call) in `if (!healthOnly) { ... }`.
- Leave the `/v2/daily` and `/v2/sleep` blocks and the `terra_daily_health` upserts untouched.

### `src/hooks/use-terra-daily-health.ts`
- In `useRefreshTerraDailyHealth.refresh`, change the invoke body from `provider ? { provider } : {}` to `{ healthOnly: true, ...(provider ? { provider } : {}) }` so the manual refresh button only pulls health data.

No other callers of `terra-sync` need to change; they continue with the default `healthOnly: false` and full activity sync still runs on schedule / from other entry points.
