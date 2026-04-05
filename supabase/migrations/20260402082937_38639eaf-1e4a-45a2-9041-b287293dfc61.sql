
-- 1. Revoke UPDATE on sensitive columns from authenticated users
REVOKE UPDATE (trial_used, training_score) ON public.profiles FROM authenticated;

-- 2. Add a BEFORE UPDATE trigger to prevent trial_used from being reset
CREATE OR REPLACE FUNCTION public.prevent_trial_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.trial_used = true AND NEW.trial_used = false THEN
    RAISE EXCEPTION 'Cannot reset trial_used';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_trial_reset_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_trial_reset();

-- 3. Add explicit admin-only INSERT/DELETE policies on user_roles
CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Add user self-access SELECT policy on strava_connections
CREATE POLICY "Users can view own strava connection"
  ON public.strava_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
