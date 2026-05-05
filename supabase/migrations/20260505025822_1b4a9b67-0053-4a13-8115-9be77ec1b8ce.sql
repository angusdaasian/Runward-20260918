
SELECT cron.schedule(
  'weekly-plan-review-monday-9am-hkt',
  '0 1 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/weekly-plan-review?mode=cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $$
);
