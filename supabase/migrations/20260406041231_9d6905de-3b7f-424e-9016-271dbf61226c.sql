
-- Fix 1: Remove misconfigured anon policy on posture_analyses
DROP POLICY IF EXISTS "Service role can read all for averages" ON posture_analyses;

-- Replace with service_role-scoped policy
CREATE POLICY "Service role can read all for averages"
ON posture_analyses
FOR SELECT
TO service_role
USING (true);

-- Fix 2: Restrict has_role() to only check the caller's own UID
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
