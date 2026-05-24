DELETE FROM public.terra_webhook_events
WHERE received_at < now() - interval '7 days';