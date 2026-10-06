CREATE OR REPLACE FUNCTION public.enforce_single_fitness_provider_suunto()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.user_has_other_fitness_provider(_user_id uuid, _exclude text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    (_exclude NOT IN ('strava','suunto') AND EXISTS (SELECT 1 FROM public.strava_connections WHERE user_id = _user_id))
    OR (_exclude NOT IN ('terra','suunto') AND EXISTS (SELECT 1 FROM public.terra_connections WHERE user_id = _user_id AND active = true))
    OR (_exclude NOT IN ('intervals','suunto') AND EXISTS (SELECT 1 FROM public.intervals_connections WHERE user_id = _user_id));
$$;