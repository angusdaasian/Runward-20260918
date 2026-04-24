-- ai_coach_preferences
CREATE TABLE public.ai_coach_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  preferred_units text NOT NULL DEFAULT 'kilometers',
  training_goal text,
  target_race_date date,
  experience_level text,
  training_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  injuries_concerns text,
  training_intensity text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_coach_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own coach preferences"
  ON public.ai_coach_preferences FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own coach preferences"
  ON public.ai_coach_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own coach preferences"
  ON public.ai_coach_preferences FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own coach preferences"
  ON public.ai_coach_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_coach_preferences_updated_at
  BEFORE UPDATE ON public.ai_coach_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ai_coach_conversations
CREATE TABLE public.ai_coach_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_coach_conversations_user_session
  ON public.ai_coach_conversations (user_id, session_id, created_at);

ALTER TABLE public.ai_coach_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own coach conversations"
  ON public.ai_coach_conversations FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own coach conversations"
  ON public.ai_coach_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own coach conversations"
  ON public.ai_coach_conversations FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own coach conversations"
  ON public.ai_coach_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- ai_coach_insights
CREATE TABLE public.ai_coach_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  insight_type text NOT NULL,
  insight_key text NOT NULL,
  insight_value text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, insight_key)
);

CREATE INDEX idx_ai_coach_insights_user ON public.ai_coach_insights (user_id);

ALTER TABLE public.ai_coach_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own coach insights"
  ON public.ai_coach_insights FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own coach insights"
  ON public.ai_coach_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own coach insights"
  ON public.ai_coach_insights FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own coach insights"
  ON public.ai_coach_insights FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_coach_insights_updated_at
  BEFORE UPDATE ON public.ai_coach_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ai_coach_usage
CREATE TABLE public.ai_coach_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  message_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.ai_coach_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own coach usage"
  ON public.ai_coach_usage FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own coach usage"
  ON public.ai_coach_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own coach usage"
  ON public.ai_coach_usage FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_coach_usage_updated_at
  BEFORE UPDATE ON public.ai_coach_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();