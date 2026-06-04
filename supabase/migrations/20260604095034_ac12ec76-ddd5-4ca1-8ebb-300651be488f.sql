
-- Helper to check whether a user already has any "fitness" connection
CREATE OR REPLACE FUNCTION public.user_has_other_fitness_provider(
  _user_id uuid,
  _exclude text  -- 'suunto' | 'terra' | 'strava'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (_exclude <> 'suunto' AND EXISTS (
      SELECT 1 FROM public.suunto_connections WHERE user_id = _user_id
    ))
    OR
    (_exclude <> 'strava' AND EXISTS (
      SELECT 1 FROM public.strava_connections WHERE user_id = _user_id
    ))
    OR
    (_exclude <> 'terra' AND EXISTS (
      SELECT 1 FROM public.terra_connections WHERE user_id = _user_id AND active = true
    ));
$$;

CREATE OR REPLACE FUNCTION public.enforce_single_fitness_provider_suunto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.user_has_other_fitness_provider(NEW.user_id, 'suunto') THEN
    RAISE EXCEPTION 'User already has a Strava or Terra connection. Disconnect it before connecting Suunto.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_single_fitness_provider_strava()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.user_has_other_fitness_provider(NEW.user_id, 'strava') THEN
    RAISE EXCEPTION 'User already has a Suunto or Terra connection. Disconnect it before connecting Strava.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_single_fitness_provider_terra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the row is (or becomes) active
  IF COALESCE(NEW.active, true) = true
     AND public.user_has_other_fitness_provider(NEW.user_id, 'terra') THEN
    RAISE EXCEPTION 'User already has a Suunto or Strava connection. Disconnect it before connecting Terra.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_fitness_suunto ON public.suunto_connections;
CREATE TRIGGER trg_single_fitness_suunto
  BEFORE INSERT ON public.suunto_connections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_fitness_provider_suunto();

DROP TRIGGER IF EXISTS trg_single_fitness_strava ON public.strava_connections;
CREATE TRIGGER trg_single_fitness_strava
  BEFORE INSERT ON public.strava_connections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_fitness_provider_strava();

DROP TRIGGER IF EXISTS trg_single_fitness_terra ON public.terra_connections;
CREATE TRIGGER trg_single_fitness_terra
  BEFORE INSERT OR UPDATE OF active ON public.terra_connections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_fitness_provider_terra();
