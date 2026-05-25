SELECT net.http_post(
  url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-today-oneoff-tick',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-webhook-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
);