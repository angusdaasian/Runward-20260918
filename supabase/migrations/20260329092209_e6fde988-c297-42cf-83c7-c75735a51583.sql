
-- Add environment column to strava_activities
ALTER TABLE public.strava_activities 
ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'dev';

-- Add environment column to strava_connections
ALTER TABLE public.strava_connections 
ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'dev';

-- Update all existing data to 'dev'
UPDATE public.strava_activities SET environment = 'dev' WHERE environment = 'dev';
UPDATE public.strava_connections SET environment = 'dev' WHERE environment = 'dev';
