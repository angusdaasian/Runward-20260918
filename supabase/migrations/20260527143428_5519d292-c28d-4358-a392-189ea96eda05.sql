
CREATE TABLE public.terra_sync_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  function_name text NOT NULL,
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_terra_sync_usage_user_fn_time
  ON public.terra_sync_usage (user_id, function_name, called_at DESC);

GRANT SELECT ON public.terra_sync_usage TO authenticated;
GRANT ALL ON public.terra_sync_usage TO service_role;

ALTER TABLE public.terra_sync_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own terra sync usage"
  ON public.terra_sync_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
