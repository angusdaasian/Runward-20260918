CREATE OR REPLACE FUNCTION public.invoke_plan_auto_adjust(p_limit integer DEFAULT 25, p_dry_run boolean DEFAULT false)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions'
AS $function$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'plan_auto_adjust_webhook_url' LIMIT 1;

  IF v_url IS NULL THEN
    v_url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/plan-auto-adjust';
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Missing vault secret: webhook_auth_key';
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-key', v_key
    ),
    body := jsonb_build_object('cron', true, 'limit', p_limit, 'dry_run', p_dry_run),
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.invoke_plan_auto_adjust(integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_plan_auto_adjust(integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.invoke_plan_auto_adjust(integer, boolean) FROM authenticated;