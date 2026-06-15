
CREATE OR REPLACE FUNCTION public.tg_enqueue_activity_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
BEGIN
  v_source := CASE TG_TABLE_NAME
    WHEN 'strava_activities' THEN 'strava'
    WHEN 'intervals_activities' THEN 'intervals'
    WHEN 'terra_activities' THEN 'terra'
    WHEN 'polar_activities' THEN 'polar'
    WHEN 'suunto_activities' THEN 'suunto'
    WHEN 'garmin_activities' THEN 'garmin'
    WHEN 'apple_health_activities' THEN 'apple_health'
    ELSE TG_TABLE_NAME
  END;

  INSERT INTO public.webhook_deliveries(
    app_id, user_id, event_type, object_type, object_id, payload, status, next_attempt_at
  )
  SELECT
    a.app_id,
    NEW.user_id,
    'activity.created',
    'activity',
    v_source || '_' || NEW.id::text,
    jsonb_build_object(
      'id', v_source || '_' || NEW.id::text,
      'source', v_source,
      'activity', to_jsonb(NEW)
    ),
    'pending',
    now()
  FROM public.oauth_authorizations a
  JOIN public.oauth_apps app ON app.id = a.app_id
  WHERE a.user_id = NEW.user_id
    AND a.revoked_at IS NULL
    AND app.status = 'active'
    AND app.webhook_url IS NOT NULL
    AND 'activity:read' = ANY(a.scopes);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block activity ingest on webhook enqueue failures
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_webhook_strava ON public.strava_activities;
CREATE TRIGGER trg_enqueue_webhook_strava AFTER INSERT ON public.strava_activities
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_activity_webhook();

DROP TRIGGER IF EXISTS trg_enqueue_webhook_intervals ON public.intervals_activities;
CREATE TRIGGER trg_enqueue_webhook_intervals AFTER INSERT ON public.intervals_activities
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_activity_webhook();

DROP TRIGGER IF EXISTS trg_enqueue_webhook_terra ON public.terra_activities;
CREATE TRIGGER trg_enqueue_webhook_terra AFTER INSERT ON public.terra_activities
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_activity_webhook();

DROP TRIGGER IF EXISTS trg_enqueue_webhook_polar ON public.polar_activities;
CREATE TRIGGER trg_enqueue_webhook_polar AFTER INSERT ON public.polar_activities
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_activity_webhook();

DROP TRIGGER IF EXISTS trg_enqueue_webhook_suunto ON public.suunto_activities;
CREATE TRIGGER trg_enqueue_webhook_suunto AFTER INSERT ON public.suunto_activities
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_activity_webhook();

DROP TRIGGER IF EXISTS trg_enqueue_webhook_garmin ON public.garmin_activities;
CREATE TRIGGER trg_enqueue_webhook_garmin AFTER INSERT ON public.garmin_activities
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_activity_webhook();

DROP TRIGGER IF EXISTS trg_enqueue_webhook_apple ON public.apple_health_activities;
CREATE TRIGGER trg_enqueue_webhook_apple AFTER INSERT ON public.apple_health_activities
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_activity_webhook();
