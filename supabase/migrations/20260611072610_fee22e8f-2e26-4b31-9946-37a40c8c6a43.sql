
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_link_code TEXT,
  ADD COLUMN IF NOT EXISTS telegram_link_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_daily_workout BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id ON public.profiles(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_link_code ON public.profiles(telegram_link_code) WHERE telegram_link_code IS NOT NULL;
