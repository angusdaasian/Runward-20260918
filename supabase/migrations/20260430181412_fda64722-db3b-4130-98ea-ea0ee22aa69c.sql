-- Unschedule old job
SELECT cron.unschedule('reset-season-monthly');

-- Schedule a daily check at 16:00 UTC. The wrapper only invokes
-- reset-season when "tomorrow in HKT" is day 1 of the month, which
-- corresponds to 00:00 HKT on the 1st.
SELECT cron.schedule(
  'reset-season-monthly-hkt',
  '0 16 * * *',
  $$
  DO $do$
  BEGIN
    IF EXTRACT(DAY FROM ((now() AT TIME ZONE 'Asia/Hong_Kong') + interval '1 day')) = 1 THEN
      PERFORM public.invoke_reset_season(NULL);
    END IF;
  END
  $do$;
  $$
);