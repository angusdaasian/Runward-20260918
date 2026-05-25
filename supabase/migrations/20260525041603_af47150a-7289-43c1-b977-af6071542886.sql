
-- Unschedule any existing one-off cron
SELECT public.unschedule_terra_today_oneoff();

-- Clear any leftover pending rows for today
DELETE FROM public.terra_today_oneoff_queue WHERE target_date = '2026-05-25';

-- Seed queue: one row per active terra connection
INSERT INTO public.terra_today_oneoff_queue (user_id, terra_user_id, provider, target_date, status)
SELECT user_id, terra_user_id, provider, '2026-05-25'::date, 'pending'
FROM public.terra_connections
WHERE active = true AND terra_user_id IS NOT NULL;

-- Schedule cron every 20 seconds, invoking the tick function
SELECT cron.schedule(
  'terra-today-oneoff',
  '20 seconds',
  $$
  SELECT net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-today-oneoff-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
