-- Run once now
DELETE FROM public.debug_logs WHERE created_at < now() - interval '7 days';

-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule existing job if any
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'debug-logs-weekly-cleanup';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule: every Sunday 00:00 HKT (UTC+8) = Saturday 16:00 UTC
SELECT cron.schedule(
  'debug-logs-weekly-cleanup',
  '0 16 * * 6',
  $$DELETE FROM public.debug_logs WHERE created_at < now() - interval '7 days'$$
);