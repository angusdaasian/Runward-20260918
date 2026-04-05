
CREATE TABLE public.posture_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  overall_score NUMERIC(4,1) NOT NULL DEFAULT 0,
  head_score NUMERIC(4,1) NOT NULL DEFAULT 0,
  shoulder_score NUMERIC(4,1) NOT NULL DEFAULT 0,
  upper_limb_score NUMERIC(4,1) NOT NULL DEFAULT 0,
  torso_score NUMERIC(4,1) NOT NULL DEFAULT 0,
  lower_limb_score NUMERIC(4,1) NOT NULL DEFAULT 0,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.posture_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own analyses"
  ON public.posture_analyses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own analyses"
  ON public.posture_analyses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can read all for averages"
  ON public.posture_analyses FOR SELECT TO anon
  USING (true);

CREATE OR REPLACE FUNCTION public.get_posture_averages()
RETURNS TABLE(
  avg_overall NUMERIC,
  avg_head NUMERIC,
  avg_shoulder NUMERIC,
  avg_upper_limb NUMERIC,
  avg_torso NUMERIC,
  avg_lower_limb NUMERIC,
  total_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROUND(AVG(overall_score), 1),
    ROUND(AVG(head_score), 1),
    ROUND(AVG(shoulder_score), 1),
    ROUND(AVG(upper_limb_score), 1),
    ROUND(AVG(torso_score), 1),
    ROUND(AVG(lower_limb_score), 1),
    COUNT(*)
  FROM public.posture_analyses;
$$;
