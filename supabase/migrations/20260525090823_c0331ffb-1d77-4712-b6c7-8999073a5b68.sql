INSERT INTO public.terra_today_oneoff_queue (user_id, terra_user_id, provider, target_date, status)
VALUES ('b97db46d-6300-4300-9ff0-9c6fe1e055fd', '921132a8-7def-4b0a-b7c4-ad7a36e359cb', 'ZEPP', DATE '2026-05-25', 'pending');

SELECT net.http_post(
  url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-today-oneoff-tick',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-webhook-key', (select decrypted_secret from vault.decrypted_secrets where name='webhook_auth_key' limit 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;