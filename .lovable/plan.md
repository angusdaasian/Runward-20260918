

## Root Cause

The `profiles` table has these SELECT RLS policies:
1. `Users can view their own profile` — `auth.uid() = user_id`
2. `Admins can read all profiles` — admins only

There is **NO policy** allowing authenticated users to read OTHER users' profiles. So when `LeaderboardTabs.tsx` runs:

```ts
supabase.from("profiles").select("user_id, display_name, ...").eq("is_premium", ...)
```

RLS filters the result down to **only the current user's own row** (or nothing if they're not premium and querying premium). That's why every user sees a different leaderboard — they only see themselves.

The DB confirms 7 profiles have `monthly_xp > 0`, but each user only sees their own.

## The Fix

Expose only the public leaderboard fields (display_name, avatar_url, rank, xp, premium flag) to all authenticated users — without leaking private profile data (age, sex, last_login, training_score, streaks, trial_used, etc.).

### Approach: Security-definer RPC function

Create a function `get_leaderboard(p_is_premium boolean, p_limit int)` that:
- Runs as `SECURITY DEFINER` (bypasses RLS safely)
- Returns ONLY: `user_id, display_name, avatar_url, monthly_xp, is_premium`
- Computed `rank_tier` / `division` are already derived client-side from XP, so we don't even need to return them
- Granted EXECUTE to `authenticated`

Then update `LeaderboardTabs.tsx` to call `supabase.rpc('get_leaderboard', { p_is_premium: ..., p_limit: ... })` instead of querying `profiles` directly.

### Why this approach (vs adding a broad SELECT policy)

A broad `SELECT TO authenticated USING (true)` policy on `profiles` would expose every column on every profile — including age, sex, trial_used, last_login, streaks, training_score. The RPC keeps the column allowlist narrow and explicit.

## Changes

1. **Migration**: Create `public.get_leaderboard(p_is_premium boolean, p_limit int)` SECURITY DEFINER function returning the 5 safe fields, ordered by `monthly_xp DESC`, filtered by `monthly_xp > 0`.

2. **`src/components/rewards/LeaderboardTabs.tsx`**: Replace the `.from("profiles").select(...)` query with `supabase.rpc("get_leaderboard", { p_is_premium: league === "premium", p_limit: limit })`. Drop `rank_tier` / `division` from the row type since they're already computed from XP via `getRankFromXP()`.

3. **`supabase/functions/reset-season/index.ts`**: Already uses service-role key, so it bypasses RLS — no change needed.

That's it. Single migration + one component edit fixes the issue without exposing any private profile data.

