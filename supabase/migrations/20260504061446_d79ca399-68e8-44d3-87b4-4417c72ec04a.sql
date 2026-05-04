UPDATE public.terra_activities SET raw_json = NULL WHERE raw_json IS NOT NULL;
TRUNCATE TABLE public.terra_webhook_events;