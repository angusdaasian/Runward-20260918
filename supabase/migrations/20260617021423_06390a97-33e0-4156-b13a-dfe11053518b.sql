CREATE TABLE public.bot_pending_plan_suggestions (
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('telegram','whatsapp')),
  plan_id uuid NOT NULL,
  changes jsonb NOT NULL,
  summary_en text,
  summary_zh text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel)
);
GRANT ALL ON public.bot_pending_plan_suggestions TO service_role;
ALTER TABLE public.bot_pending_plan_suggestions ENABLE ROW LEVEL SECURITY;