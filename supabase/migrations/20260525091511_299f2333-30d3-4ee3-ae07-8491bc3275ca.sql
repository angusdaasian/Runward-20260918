INSERT INTO public.terra_today_oneoff_queue (user_id, terra_user_id, provider, target_date, status)
VALUES ('b7fb9875-1188-424f-8092-991265618c5e', 'c3198c63-8be2-4084-bb2d-e3eb65b346ae', 'GARMIN', DATE '2026-05-25', 'pending');

SELECT net.http_post(
  url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-today-oneoff-tick',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-webhook-key', (select decrypted_secret from vault.decrypted_secrets where name='webhook_auth_key' limit 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;