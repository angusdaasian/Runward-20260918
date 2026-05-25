INSERT INTO public.terra_today_oneoff_queue (user_id, terra_user_id, provider, target_date, status)
VALUES ('0515e94a-4550-4bd5-838c-4fe7aaa7a598', 'c1c707f2-b637-4956-ae64-3aca1f129f9c', 'GARMIN', (now() AT TIME ZONE 'Asia/Hong_Kong')::date, 'pending');

DO $$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1;
  PERFORM net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-today-oneoff-tick',
    headers := jsonb_build_object('Content-Type','application/json','x-webhook-key', v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END $$;