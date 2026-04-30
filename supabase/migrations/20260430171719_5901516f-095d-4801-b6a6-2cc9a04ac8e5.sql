
-- Ensure pg_cron + pg_net are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store the webhook auth key + service URL in Vault so we never paste them into SQL.
-- (idempotent: skip if already there)
DO $$
DECLARE
  v_existing_key uuid;
BEGIN
  SELECT id INTO v_existing_key FROM vault.secrets WHERE name = 'reset_season_webhook_url';
  IF v_existing_key IS NULL THEN
    PERFORM vault.create_secret(
      'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/reset-season',
      'reset_season_webhook_url',
      'URL of the reset-season edge function'
    );
  END IF;
END $$;

-- Helper that posts to the reset-season function using WEBHOOK_AUTH_KEY from vault.
-- The admin must populate vault.secrets with name='webhook_auth_key' (value = WEBHOOK_AUTH_KEY).
CREATE OR REPLACE FUNCTION public.invoke_reset_season(p_month_year text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
  v_body jsonb;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'reset_season_webhook_url' LIMIT 1;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'Missing vault secrets: reset_season_webhook_url and/or webhook_auth_key';
  END IF;

  v_body := CASE
    WHEN p_month_year IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object('month_year', p_month_year)
  END;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-webhook-key', v_key
    ),
    body := v_body,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- Lock down: only admins (or service role) should be able to call this directly.
REVOKE ALL ON FUNCTION public.invoke_reset_season(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_reset_season(text) TO service_role;

-- Schedule: 00:05 UTC on the 1st of every month
DO $$
BEGIN
  -- Unschedule any prior version with same name, then re-create
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'reset-season-monthly';

  PERFORM cron.schedule(
    'reset-season-monthly',
    '5 0 1 * *',
    $cron$ SELECT public.invoke_reset_season(NULL); $cron$
  );
END $$;
