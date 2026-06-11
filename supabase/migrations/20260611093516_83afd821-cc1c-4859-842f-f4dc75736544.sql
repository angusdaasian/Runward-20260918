
-- Profile fields for WhatsApp linking + preferences
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_wa_id text,
  ADD COLUMN IF NOT EXISTS whatsapp_phone_e164 text,
  ADD COLUMN IF NOT EXISTS whatsapp_link_code text,
  ADD COLUMN IF NOT EXISTS whatsapp_link_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_daily_workout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_activity_feedback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_coach_session_id uuid;

CREATE INDEX IF NOT EXISTS profiles_whatsapp_wa_id_idx ON public.profiles (whatsapp_wa_id);
CREATE INDEX IF NOT EXISTS profiles_whatsapp_link_code_idx ON public.profiles (whatsapp_link_code);

-- Pending post-run RPE prompts sent over WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_pending_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wa_id text NOT NULL,
  activity_source text NOT NULL,
  activity_key text NOT NULL,
  activity_db_id uuid,
  activity_summary jsonb,
  prompt_message_id text,
  rpe smallint,
  response_text text,
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_source, activity_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_pending_prompts TO authenticated;
GRANT ALL ON public.whatsapp_pending_prompts TO service_role;

ALTER TABLE public.whatsapp_pending_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own whatsapp prompts"
  ON public.whatsapp_pending_prompts FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wa_pending_prompts_chat_pending_idx
  ON public.whatsapp_pending_prompts (wa_id, responded_at, expires_at);
