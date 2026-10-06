# Check of the latest watch connections

## What I found
- **0a98318e (Oct 6, 07:16 UTC):** the connection was never finished (still "pending"), so nothing has synced. They need to finish connecting.
- **9c8c354f (Oct 6, connected 06:18 UTC, free):** 0 runs imported. Nothing old came in, which is correct. But their older connection shows runs up to Sep 21, which is inside the 30-day window, so the catch-up probably should have found a few runs. Daily health is arriving.
- **46997d86 (Oct 5, premium annual until Apr 2027):** 1,254 runs going back to 2022. Full history is allowed for premium, so this is expected.
- **6405eda0 (Oct 5, free):** 2 runs, both after connecting. Nothing older than 30 days.
- **Ownership:** no run is saved under more than one account. Every account only has its own runs.

## Proposed next step (only with your approval)
1. Run a 30-day catch-up for 9c8c354f on its own (one account only) and check the sync log to see whether the provider returns their Sep 6–21 runs.
2. If runs come back, make sure they belong to that account and there are no duplicates of their old runs. If nothing comes back, report that the provider has no recent runs for them.
3. Make no changes to any other account.
