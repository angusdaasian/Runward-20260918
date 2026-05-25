create or replace function public.unschedule_terra_webhook_drain()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'terra-webhook-drain';
exception when others then
  null;
end;
$$;

-- Idempotent (re)schedule: unschedule any prior version first.
select public.unschedule_terra_webhook_drain();

select cron.schedule(
  'terra-webhook-drain',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-webhook-worker',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'x-webhook-key', (select decrypted_secret from vault.decrypted_secrets where name='webhook_auth_key' limit 1)
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ); $$
);