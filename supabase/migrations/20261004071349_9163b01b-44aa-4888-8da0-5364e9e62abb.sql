DROP FUNCTION IF EXISTS public.dismiss_stridee_backfill_notice();
ALTER TABLE public.stridee_connections DROP COLUMN IF EXISTS backfill_notice_pending;