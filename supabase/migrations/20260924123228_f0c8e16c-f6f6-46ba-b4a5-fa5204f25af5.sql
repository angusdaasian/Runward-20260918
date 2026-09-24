CREATE TABLE public.deduplicated_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  kept_source text,
  kept_id text,
  reason text,
  row_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);
GRANT SELECT ON public.deduplicated_activities TO authenticated;
GRANT ALL ON public.deduplicated_activities TO service_role;
ALTER TABLE public.deduplicated_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own deduplicated activities" ON public.deduplicated_activities FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_dedup_acts_user ON public.deduplicated_activities(user_id);

-- Stridee FIT cadence is per-leg for running; convert existing rows to steps/min
UPDATE public.terra_activities t SET
  avg_cadence = CASE WHEN avg_cadence IS NOT NULL THEN avg_cadence * 2 END,
  cadence_samples = CASE WHEN jsonb_typeof(cadence_samples)='array' THEN
    (SELECT jsonb_agg(jsonb_set(s, '{rpm}', to_jsonb((s->>'rpm')::numeric * 2))) FROM jsonb_array_elements(cadence_samples) s) END,
  laps = CASE WHEN jsonb_typeof(laps)='array' THEN
    (SELECT jsonb_agg(CASE WHEN l->>'average_cadence' IS NOT NULL THEN jsonb_set(l,'{average_cadence}', to_jsonb((l->>'average_cadence')::numeric*2)) ELSE l END) FROM jsonb_array_elements(laps) l) ELSE laps END,
  raw_json = coalesce(raw_json,'{}'::jsonb) || '{"cadence_spm":true}'::jsonb
WHERE terra_activity_id LIKE 'stridee_%' AND activity_type IN ('running','trail_running','treadmill_running')
  AND NOT coalesce((raw_json->>'cadence_spm')::boolean,false);