ALTER TABLE public.user_races
ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'none'
CHECK (priority IN ('A', 'B', 'C', 'none'));

CREATE INDEX IF NOT EXISTS idx_user_races_user_priority ON public.user_races(user_id, priority);