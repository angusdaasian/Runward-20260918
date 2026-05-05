## Changes

1. Delete `supabase/functions/garmin-daily-health-sync/index.ts` (and remove the deployed function via the delete-edge-functions tool).
2. Remove the `[functions.garmin-daily-health-sync] verify_jwt = false` block from `supabase/config.toml`.

No app code references this function, so nothing else needs to change.