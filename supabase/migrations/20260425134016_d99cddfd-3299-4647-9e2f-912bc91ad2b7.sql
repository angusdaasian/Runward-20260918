ALTER TABLE public.garmin_connections
ADD COLUMN IF NOT EXISTS full_resync_done boolean NOT NULL DEFAULT false;