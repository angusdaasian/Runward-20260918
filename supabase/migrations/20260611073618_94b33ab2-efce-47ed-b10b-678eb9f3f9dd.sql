
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_activity_feedback BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.telegram_pending_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  chat_id BIGINT NOT NULL,
  activity_source TEXT NOT NULL,
  activity_key TEXT NOT NULL,
  activity_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_message_id BIGINT,
  response_text TEXT,
  rpe SMALLINT,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_source, activity_key)
);

CREATE INDEX IF NOT EXISTS idx_tg_prompts_chat_pending
  ON public.telegram_pending_prompts(chat_id, responded_at, expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_pending_prompts TO authenticated;
GRANT ALL ON public.telegram_pending_prompts TO service_role;

ALTER TABLE public.telegram_pending_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own telegram prompts"
ON public.telegram_pending_prompts FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
