CREATE TABLE public.activity_push_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  activity_key TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT activity_push_log_user_key_unique UNIQUE (user_id, activity_key)
);

CREATE INDEX idx_activity_push_log_user ON public.activity_push_log(user_id);

ALTER TABLE public.activity_push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access activity_push_log"
ON public.activity_push_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);