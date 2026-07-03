
-- Debounce table so many concurrent inserts collapse into one dedup run per user per minute
CREATE TABLE IF NOT EXISTS public.dedup_debounce (
  user_id uuid PRIMARY KEY,
  last_fired_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.dedup_debounce TO service_role;
ALTER TABLE public.dedup_debounce ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; nothing else should touch this table.

-- Trigger function: fires dedup-activities-cross-platform via pg_net with a 60s per-user cool-down.
CREATE OR REPLACE FUNCTION public.tg_trigger_cross_platform_dedup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions'
AS $$
DECLARE
  v_url text;
  v_key text;
  v_last timestamptz;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Debounce: skip if we fired for this user within the last 60 seconds.
  INSERT INTO public.dedup_debounce(user_id, last_fired_at)
  VALUES (NEW.user_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_fired_at = CASE
      WHEN public.dedup_debounce.last_fired_at < now() - interval '60 seconds'
      THEN EXCLUDED.last_fired_at
      ELSE public.dedup_debounce.last_fired_at
    END
  RETURNING last_fired_at INTO v_last;

  -- If cool-down blocked the update, last_fired_at is unchanged (older). Skip fire.
  IF v_last < now() - interval '5 seconds' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'dedup_activities_webhook_url' LIMIT 1;
  IF v_url IS NULL THEN
    v_url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/dedup-activities-cross-platform';
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1;
  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-key', v_key
    ),
    body := jsonb_build_object(
      'userId', NEW.user_id,
      'sinceHours', 72,
      'dryRun', false
    ),
    timeout_milliseconds := 30000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block activity ingest on dedup enqueue failures.
  RETURN NEW;
END;
$$;

-- Attach trigger to every activity table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'terra_activities',
    'strava_activities',
    'suunto_activities',
    'polar_activities',
    'garmin_activities',
    'intervals_activities',
    'apple_health_activities'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_cross_platform_dedup ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_cross_platform_dedup
         AFTER INSERT ON public.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.tg_trigger_cross_platform_dedup()', t
    );
  END LOOP;
END $$;
