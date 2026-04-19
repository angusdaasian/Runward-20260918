ALTER TABLE public.activity_analyses
  ADD COLUMN IF NOT EXISTS race_id uuid,
  ADD COLUMN IF NOT EXISTS race_name text,
  ADD COLUMN IF NOT EXISTS user_comment text,
  ADD COLUMN IF NOT EXISTS weather jsonb,
  ADD COLUMN IF NOT EXISTS next_workout_en text,
  ADD COLUMN IF NOT EXISTS next_workout_zh text;