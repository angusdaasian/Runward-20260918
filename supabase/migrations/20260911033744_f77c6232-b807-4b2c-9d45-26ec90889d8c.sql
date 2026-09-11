ALTER TABLE public.terra_daily_health
  ADD COLUMN IF NOT EXISTS calories integer,
  ADD COLUMN IF NOT EXISTS distance_metres numeric,
  ADD COLUMN IF NOT EXISTS active_seconds integer;