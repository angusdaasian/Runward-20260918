
-- Notification dedupe table
CREATE TABLE IF NOT EXISTS public.terra_inactivity_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  sent_on date NOT NULL,
  days_inactive integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, sent_on)
);

GRANT SELECT ON public.terra_inactivity_notifications TO authenticated;
GRANT ALL ON public.terra_inactivity_notifications TO service_role;

ALTER TABLE public.terra_inactivity_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read inactivity notifications" ON public.terra_inactivity_notifications;
CREATE POLICY "Admins read inactivity notifications"
  ON public.terra_inactivity_notifications
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role full access inactivity notifications" ON public.terra_inactivity_notifications;
CREATE POLICY "Service role full access inactivity notifications"
  ON public.terra_inactivity_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_terra_inactivity_notifications_user
  ON public.terra_inactivity_notifications(user_id, sent_on);

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedules
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
    'terra-inactivity-sweep-firstrun',
    'terra-inactivity-sweep-daily'
  );
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Single daily cron at 16:00 UTC == 00:00 HKT next day.
-- The edge function dispatches by HKT date: deauth on day 1, warn on day 30/31,
-- noop otherwise. First effective deauth fires on June 30 2026 16:00 UTC
-- (= July 1 2026 00:00 HKT). Earlier runs between now and then will be no-ops.
SELECT cron.schedule(
  'terra-inactivity-sweep-daily',
  '0 16 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-inactivity-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZ2h2Y2x3aHhuamVza2RvZGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTE0MDQsImV4cCI6MjA5MDkyNzQwNH0.ymRqbqpdRssDmDI_zCWsKNFKAOQGfns76JnSmTsIaBM'
    ),
    body := jsonb_build_object('source','cron')
  );
  $$
);
