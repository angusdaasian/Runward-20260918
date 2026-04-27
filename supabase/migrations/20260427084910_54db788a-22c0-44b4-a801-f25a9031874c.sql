-- Add finish_time_seconds column to user_races
ALTER TABLE public.user_races
ADD COLUMN IF NOT EXISTS finish_time_seconds INTEGER,
ADD COLUMN IF NOT EXISTS finish_time_source TEXT,
ADD COLUMN IF NOT EXISTS finish_activity_id TEXT;

CREATE INDEX IF NOT EXISTS idx_user_races_user_date ON public.user_races(user_id, race_date);