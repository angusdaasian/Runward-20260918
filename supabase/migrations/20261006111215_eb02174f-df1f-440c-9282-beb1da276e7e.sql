ALTER TABLE public.suunto_activities
  ADD COLUMN IF NOT EXISTS laps jsonb,
  ADD COLUMN IF NOT EXISTS calories numeric,
  ADD COLUMN IF NOT EXISTS avg_cadence numeric,
  ADD COLUMN IF NOT EXISTS device_model text;
UPDATE public.suunto_activities s
SET elevation_samples = (
  SELECT jsonb_agg(CASE WHEN x ? 'ele' THEN (x - 'ele') || jsonb_build_object('e', x->'ele') ELSE x END)
  FROM jsonb_array_elements(s.elevation_samples) x)
WHERE jsonb_typeof(s.elevation_samples) = 'array' AND s.elevation_samples::text LIKE '%"ele"%';