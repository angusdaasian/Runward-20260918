ALTER TABLE public.garmin_connections
  ADD COLUMN IF NOT EXISTS garmin_email_encrypted text,
  ADD COLUMN IF NOT EXISTS needs_reauth boolean NOT NULL DEFAULT false;