ALTER TABLE public.ai_coach_conversations
  ADD COLUMN IF NOT EXISTS plan_suggestion jsonb,
  ADD COLUMN IF NOT EXISTS plan_suggestion_status text;