ALTER TABLE public.user_races
  ADD COLUMN IF NOT EXISTS distance_km numeric,
  ADD COLUMN IF NOT EXISTS elevation_m numeric;