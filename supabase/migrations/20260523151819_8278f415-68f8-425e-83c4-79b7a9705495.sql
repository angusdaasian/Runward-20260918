
ALTER TABLE public.terra_data_payloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access terra_data_payloads"
  ON public.terra_data_payloads
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.terra_misc_payloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access terra_misc_payloads"
  ON public.terra_misc_payloads
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.terra_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access terra_users"
  ON public.terra_users
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
