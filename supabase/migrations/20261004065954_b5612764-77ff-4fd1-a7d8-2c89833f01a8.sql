ALTER TABLE public.stridee_connections ADD COLUMN IF NOT EXISTS backfill_notice_pending boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.dismiss_stridee_backfill_notice()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.stridee_connections SET backfill_notice_pending = false WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.dismiss_stridee_backfill_notice() TO authenticated;