
CREATE OR REPLACE FUNCTION public.user_has_other_fitness_provider(
  _user_id uuid,
  _exclude text
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
    ))
    OR
    (_exclude <> 'intervals' AND EXISTS (
      SELECT 1 FROM public.intervals_connections WHERE user_id = _user_id
    ));
$$;

CREATE OR REPLACE FUNCTION public.enforce_single_fitness_provider_intervals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.user_has_other_fitness_provider(NEW.user_id, 'intervals') THEN
    RAISE EXCEPTION 'User already has another fitness provider connection. Disconnect it before connecting intervals.icu.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_fitness_intervals ON public.intervals_connections;
CREATE TRIGGER trg_single_fitness_intervals
  BEFORE INSERT ON public.intervals_connections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_fitness_provider_intervals();
