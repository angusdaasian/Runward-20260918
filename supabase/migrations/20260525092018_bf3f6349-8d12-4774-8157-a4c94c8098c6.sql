-- Enqueue 2026-05-25 for active connections that don't already have a pending/in_flight row for today
INSERT INTO public.terra_today_oneoff_queue (user_id, terra_user_id, provider, target_date, status)
SELECT tc.user_id, tc.terra_user_id, tc.provider, DATE '2026-05-25', 'pending'
FROM public.terra_connections tc
WHERE tc.active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.terra_today_oneoff_queue q
    WHERE q.user_id = tc.user_id
      AND q.target_date = DATE '2026-05-25'
      AND q.status IN ('pending','in_flight')
  );

-- Idempotent unschedule of any prior job
SELECT public.unschedule_terra_today_oneoff();

-- Schedule every 15 seconds
SELECT cron.schedule(
  'terra-today-oneoff',
  '15 seconds',
  $$
  select net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-today-oneoff-tick',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-webhook-key', (select decrypted_secret from vault.decrypted_secrets where name='webhook_auth_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);