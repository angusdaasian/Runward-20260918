ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET last_active_at = now() WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.touch_last_active() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;