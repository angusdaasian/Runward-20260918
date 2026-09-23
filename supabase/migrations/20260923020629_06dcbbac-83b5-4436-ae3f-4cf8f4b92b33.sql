ALTER TABLE public.garmin_connections
  ADD COLUMN IF NOT EXISTS backup_signup_at timestamptz;

ALTER TABLE public.garmin_connections
  ALTER COLUMN last_polled_at SET DEFAULT now();

UPDATE public.garmin_connections
SET last_polled_at = now()
WHERE needs_reauth IS NOT TRUE;