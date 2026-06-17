-- Restrict SELECT on sensitive OAuth token columns to service_role only.
-- Authenticated users keep access to non-sensitive columns so existence checks
-- and UI continue to work. Edge functions use service_role and are unaffected.

REVOKE SELECT ON public.strava_connections FROM authenticated;
GRANT SELECT (
  id, user_id, strava_athlete_id, expires_at, strava_app_id, environment,
  created_at, updated_at
) ON public.strava_connections TO authenticated;

REVOKE SELECT ON public.suunto_connections FROM authenticated;
GRANT SELECT (
  id, user_id, suunto_username, expires_at, created_at, updated_at
) ON public.suunto_connections TO authenticated;

REVOKE SELECT ON public.polar_connections FROM authenticated;
GRANT SELECT (
  user_id, polar_user_id, member_id, expires_at, created_at, updated_at
) ON public.polar_connections TO authenticated;

REVOKE SELECT ON public.intervals_connections FROM authenticated;
GRANT SELECT (
  id, user_id, athlete_id, expires_at, scope, created_at, updated_at
) ON public.intervals_connections TO authenticated;
