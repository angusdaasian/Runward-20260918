CREATE TABLE public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX mcp_tokens_user_idx ON public.mcp_tokens(user_id);
GRANT SELECT, INSERT, DELETE ON public.mcp_tokens TO authenticated;
GRANT ALL ON public.mcp_tokens TO service_role;
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mcp tokens select" ON public.mcp_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own mcp tokens insert" ON public.mcp_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own mcp tokens delete" ON public.mcp_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);