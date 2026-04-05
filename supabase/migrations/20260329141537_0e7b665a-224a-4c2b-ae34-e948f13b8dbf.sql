
CREATE TABLE public.activity_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  analysis_en text,
  analysis_zh text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(activity_id)
);

ALTER TABLE public.activity_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own activity analyses"
  ON public.activity_analyses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity analyses"
  ON public.activity_analyses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activity analyses"
  ON public.activity_analyses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
