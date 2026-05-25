-- Enqueue all active connections for today (HKT)
insert into public.terra_today_oneoff_queue (user_id, terra_user_id, provider, target_date, status)
select user_id, terra_user_id, provider, ((now() at time zone 'Asia/Hong_Kong')::date), 'pending'
from public.terra_connections
where active = true;

-- Schedule (or reschedule) the drain cron at 10s cadence: 6 invocations per minute
select public.unschedule_terra_today_oneoff();

select cron.schedule(
  'terra-today-oneoff',
  '10 seconds',
  $$
  select net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-today-oneoff-tick',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-webhook-key', (select decrypted_secret from vault.decrypted_secrets where name='webhook_auth_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);