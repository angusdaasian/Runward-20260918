CREATE TABLE public.territory_sync_state (
  user_id uuid PRIMARY KEY,
  locked_until timestamptz NOT NULL DEFAULT 'epoch',
  last_fired_at timestamptz NOT NULL DEFAULT 'epoch'
);
GRANT ALL ON public.territory_sync_state TO service_role;
ALTER TABLE public.territory_sync_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_lock_territory(_uid uuid, _secs int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  INSERT INTO public.territory_sync_state(user_id) VALUES (_uid) ON CONFLICT DO NOTHING;
  UPDATE public.territory_sync_state SET locked_until = now() + make_interval(secs => _secs)
   WHERE user_id = _uid AND locked_until < now() RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END $$;

CREATE OR REPLACE FUNCTION public.unlock_territory(_uid uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.territory_sync_state SET locked_until = 'epoch' WHERE user_id = _uid;
$$;
REVOKE ALL ON FUNCTION public.try_lock_territory(uuid,int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.unlock_territory(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_lock_territory(uuid,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_territory(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_trigger_territory_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','vault','extensions' AS $$
DECLARE v_key text; v_last timestamptz;
BEGIN
  IF NEW.user_id IS NULL OR NEW.summary_polyline IS NULL OR NEW.summary_polyline = '' THEN RETURN NEW; END IF;
  INSERT INTO public.territory_sync_state(user_id, last_fired_at) VALUES (NEW.user_id, now())
  ON CONFLICT (user_id) DO UPDATE SET last_fired_at = CASE
    WHEN public.territory_sync_state.last_fired_at < now() - interval '20 seconds' THEN now()
    ELSE public.territory_sync_state.last_fired_at END
  RETURNING last_fired_at INTO v_last;
  IF v_last < now() - interval '2 seconds' THEN RETURN NEW; END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1;
  IF v_key IS NULL THEN RETURN NEW; END IF;
  -- small delay lets a backfill batch finish inserting before processing starts
  PERFORM net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/process-territory',
    headers := jsonb_build_object('Content-Type','application/json','x-webhook-key', v_key),
    body := jsonb_build_object('userId', NEW.user_id, 'delayMs', 5000),
    timeout_milliseconds := 5000);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['terra_activities','strava_activities','garmin_activities','suunto_activities','intervals_activities'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_territory_sync ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_territory_sync AFTER INSERT OR UPDATE OF summary_polyline ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_trigger_territory_sync()', t);
  END LOOP;
END $$;