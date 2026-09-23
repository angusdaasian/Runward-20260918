ALTER TABLE public.garmin_activities
  ADD COLUMN IF NOT EXISTS hr_samples jsonb,
  ADD COLUMN IF NOT EXISTS distance_samples jsonb,
  ADD COLUMN IF NOT EXISTS elevation_samples jsonb,
  ADD COLUMN IF NOT EXISTS cadence_samples jsonb;