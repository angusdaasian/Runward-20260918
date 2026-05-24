
CREATE TABLE IF NOT EXISTS public.terra_today_oneoff_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  terra_user_id text NOT NULL,
  provider text NOT NULL,
  target_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  http_status int,
  terra_reference text,
  result text,
  attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS terra_today_oneoff_queue_pending_idx
  ON public.terra_today_oneoff_queue (status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.terra_today_oneoff_queue ENABLE ROW LEVEL SECURITY;

-- No policies: only service role (which bypasses RLS) may read/write.

CREATE OR REPLACE FUNCTION public.unschedule_terra_today_oneoff()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'terra-today-oneoff';
EXCEPTION WHEN OTHERS THEN
  -- ignore if no such job
  NULL;
END;
$$;
