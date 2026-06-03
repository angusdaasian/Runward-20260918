
-- Delete stale duplicate strava_connections rows, keeping only the most recently updated row per athlete
DELETE FROM public.strava_connections a
USING public.strava_connections b
WHERE a.strava_athlete_id = b.strava_athlete_id
  AND a.updated_at < b.updated_at;

-- Prevent the same Strava athlete from being linked to multiple users
CREATE UNIQUE INDEX IF NOT EXISTS strava_connections_athlete_id_unique
  ON public.strava_connections(strava_athlete_id);
