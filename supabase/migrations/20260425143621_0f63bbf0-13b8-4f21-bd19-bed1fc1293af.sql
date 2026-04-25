-- Reset full_resync_done for all users who triggered the buggy resync.
-- The previous version of garmin-sync marked full_resync_done=true even when
-- some monthly chunks failed to upsert (e.g. March 2026 failed due to a
-- non-integer duration_seconds), leaving those users with missing activities
-- and no automatic way to recover. Resetting the flag forces a clean re-pull
-- on their next sync with the fixed code.
UPDATE public.garmin_connections
SET full_resync_done = false
WHERE full_resync_done = true;