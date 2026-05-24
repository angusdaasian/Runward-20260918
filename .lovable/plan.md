# Fix the IOwait spike

## What's causing it

The 85% IOwait started right after we introduced the Terra webhook queue + reconcile workflow. Two pg_cron jobs are now running **every single minute** on the Free-tier instance:

- **Job 11 — `terra-reconcile`** (`* * * * *`): scans up to 500 rows from `terra_data_payloads`, 500 from `terra_misc_payloads`, 2 000 rows from `terra_webhook_events` (with a GIN scan over `payload_ids`), plus the recon log, then computes set diffs. This is the heavy one.
- **Job 12 — `process-terra-queue`** (`* * * * *`): claims a batch and runs the webhook handler. Cheaper, but still wakes the DB every 60 s.

On top of that, every Supabase Studio page load fires the expensive `pg_available_extensions` / `pg_timezone_names` / `reports-database-large-objects` probes that we can see sitting in `pg_stat_activity` for 50–90 seconds each. On a small shared-IO instance these all stack up and the disk queue blows out → 85% IOwait.

Database tables themselves are tiny (queue has 3 live rows, webhook_events has 8) and indexes are correct, so this is purely scheduling pressure, not missing indexes or table bloat.

## The fix

1. **Reschedule `terra-reconcile`** from `* * * * *` → `*/10 * * * *` (every 10 minutes). It's a safety net for missed webhooks; the live webhook path already handles 99% of traffic and the recon window is 60 minutes anyway, so 10-minute granularity is more than enough.
2. **Reschedule `process-terra-queue`** from `* * * * *` → `*/2 * * * *` (every 2 minutes). With current volume (~6 webhooks/min, batch size 25) this still drains well under capacity and halves the wakeups.
3. Leave indexes, table layout, and the `waitUntil` webhook handler unchanged.

## Technical details

Migration:

```sql
SELECT cron.alter_job(job_id := 11, schedule := '*/10 * * * *');
SELECT cron.alter_job(job_id := 12, schedule := '*/2  * * * *');
```

Expected result: IOwait should drop back to single-digit % within a few minutes. If it doesn't, the next suspect is Studio dashboard polling, which we can't change from inside the project — closing the Studio tab when not in use will help.

## Out of scope

- No edge function code changes.
- No schema or index changes.
- No upgrade to Supabase Pro (still well under Free-tier limits).
