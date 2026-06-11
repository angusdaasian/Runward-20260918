ALTER TABLE public.telegram_pending_prompts
  ADD COLUMN IF NOT EXISTS activity_db_id UUID;