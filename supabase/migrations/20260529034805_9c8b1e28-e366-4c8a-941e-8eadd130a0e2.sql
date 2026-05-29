-- Helper RPC so the edge function can unschedule its own one-off cron job.
CREATE OR REPLACE FUNCTION public.unschedule_cron_job(job_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = job_name;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.unschedule_cron_job(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unschedule_cron_job(text) TO service_role;

-- Make sure we don't double-schedule
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'one-off-earlybird-push-20260529';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule the one-off push at 04:15 UTC on May 29 2026 (= 12:15 HKT)
-- It self-unschedules via the edge function after firing.
DO $$
DECLARE
  v_key text;
  v_url text := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/send-broadcast-notification';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZ2h2Y2x3aHhuamVza2RvZGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTE0MDQsImV4cCI6MjA5MDkyNzQwNH0.ymRqbqpdRssDmDI_zCWsKNFKAOQGfns76JnSmTsIaBM';
  v_cmd text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'vault secret webhook_auth_key missing';
  END IF;

  v_cmd := format(
    $cmd$
    SELECT net.http_post(
      url := %L,
      headers := %L::jsonb,
      body := %L::jsonb,
      timeout_milliseconds := 60000
    );
    $cmd$,
    v_url,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'x-webhook-key', v_key
    )::text,
    jsonb_build_object(
      'title', '早鳥優惠剩 2 日',
      'message', '把握最後 2 日，以早鳥價升級 Premium，價格永久鎖定，日後加價都不受影響。',
      'audience', 'free',
      'self_unschedule', 'one-off-earlybird-push-20260529'
    )::text
  );

  PERFORM cron.schedule(
    'one-off-earlybird-push-20260529',
    '15 4 29 5 *',
    v_cmd
  );
END $$;