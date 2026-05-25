SELECT public.unschedule_terra_today_oneoff();
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