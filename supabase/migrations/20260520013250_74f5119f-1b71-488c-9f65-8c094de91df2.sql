ALTER TABLE public.strava_activities REPLICA IDENTITY FULL;
ALTER TABLE public.apple_health_activities REPLICA IDENTITY FULL;
ALTER TABLE public.garmin_activities REPLICA IDENTITY FULL;
ALTER TABLE public.terra_activities REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.strava_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.apple_health_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.garmin_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.terra_activities;