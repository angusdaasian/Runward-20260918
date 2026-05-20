## Issue 1 — Stale Garmin (Railway) activity until app restart

**Root cause:** `ActivitiesTab` subscribes via `supabase.channel(...).on("postgres_changes", ...)` to `strava_activities`, `apple_health_activities`, `garmin_activities`, and `terra_activities`, but **none of these tables are in the `supabase_realtime` publication**. I verified by querying `pg_publication_tables` — zero rows. So when `terra-webhook` upserts a new activity after a sync, the client never gets a change event, never invalidates React Query, and continues to show the cached merged list (Garmin row from Railway + no Terra row yet → Garmin row not de-duped). After restart, queries refetch from scratch, Terra row arrives, dedup kicks in, Garmin row disappears.

A secondary contributor: `garmin-activities` has `staleTime: 5 * 60_000` while `terra-activities` is `30_000`. On window-focus refetch only Terra refreshes within 30s; Garmin keeps serving the stale cached row.

**Fix:**
1. Migration: add the four activity tables to the `supabase_realtime` publication and set `REPLICA IDENTITY FULL` so updates emit a full row.
2. (Defensive) In `useActivities`, lower `garmin-activities` `staleTime` to `30_000` to match Terra, so the dedup pair stays in sync on refocus even if a realtime event is ever missed.

## Issue 2 — App stays in skeleton for 3-4s

The visible delay is a sum of several artificial waits that stack on cold start. Concretely, on cold start the user sees:

```
AuthProvider 400ms setTimeout    ──▶ loading=false
        │
        ▼
Index profile-check query        ──▶ checkingProfile=false  (~300-800ms)
        │
        ▼
ActivitiesTab SKELETON_MIN_MS 400ms gate + useActivities first paint
        │
        ▼
Real content
```

Plus `useActivities` fires **8 parallel queries** before first paint (strava, apple_health, garmin, terra, profile, connection, planned-workouts, user-races) and the merged-list memo waits for both Garmin and Terra to finish their first fetch before rendering rows.

**Fix (frontend-only, no behavior change):**
1. **Remove the 400ms `setTimeout(loading=false)` in `AuthContext`** on cold start. `getSession()` already resolves synchronously from storage; the delay is leftover defensive code and adds 400ms to every cold start. Keep `isWarmResume` short-circuit as is.
2. **Remove the `SKELETON_MIN_MS = 400` gate in `ActivitiesTab`.** This is a forced minimum skeleton with no purpose other than avoiding flicker — but React Query's `placeholderData` / cached data already prevents flicker on warm navigations, and on cold start it just delays first paint.
3. **Stop blocking the whole Index render on `checkingProfile`.** Today, Index returns `<TabPageSkeleton />` until the `profiles.onboarding_completed` lookup finishes, which adds ~300-800ms of dead time where the cached activities could already be painting. Change to:
   - If `onboarding_completed` is unknown, render Index optimistically (assume onboarded). Only show the Onboarding screen if the lookup returns `onboarding_completed === false`. This is safe because returning users (the common case) are already onboarded; the rare new-signup case still routes through `ONBOARDING_SIGNUP_IN_PROGRESS_KEY`.
4. **Cache `onboarding_completed` in localStorage** after the first successful check (per `user.id`) so subsequent cold starts skip the network round-trip entirely.
5. **Defer the non-critical queries in `useActivities`** so the first paint isn't gated on them. Concretely, give `user-races`, `planned-workouts`, and `fitness-connection` a small startup deferral (or mark them with `enabled` after the activities queries resolve). The home screen only needs activities + profile to render the first card.

Expected impact: cold-start time to first activity card drops from ~3-4s to ~700-1200ms (network-bound on the activities query alone).

## Files touched

- `supabase/migrations/<new>.sql` — add tables to `supabase_realtime`, set replica identity
- `src/contexts/AuthContext.tsx` — drop 400ms timeout
- `src/pages/Index.tsx` — optimistic onboarding render + localStorage cache
- `src/components/ActivitiesTab.tsx` — drop `SKELETON_MIN_MS` gate
- `src/hooks/use-activities.ts` — lower `garmin` staleTime; defer non-critical queries

No backend logic or UI changes beyond what's listed.
