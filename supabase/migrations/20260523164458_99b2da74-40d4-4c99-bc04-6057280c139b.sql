
REVOKE ALL ON FUNCTION public.claim_terra_webhook_queue(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_terra_webhook_queue(INT) TO service_role;
