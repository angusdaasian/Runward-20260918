ALTER TABLE public.garmin_connections
  ALTER COLUMN access_token DROP NOT NULL,
  ALTER COLUMN expires_at DROP NOT NULL;