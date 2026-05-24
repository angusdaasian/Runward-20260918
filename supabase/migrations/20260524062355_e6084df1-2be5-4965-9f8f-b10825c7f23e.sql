CREATE OR REPLACE FUNCTION public.unschedule_terra_webhook_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'terra-webhook-events-cleanup';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$function$;

SELECT public.unschedule_terra_webhook_cleanup();

SELECT cron.schedule(
  'terra-webhook-events-cleanup',
  '0 2 * * 0',
  $$
    DELETE FROM public.terra_webhook_events
    WHERE received_at < now() - interval '7 days';
  $$
);