-- Sahha.ai test integration: track which users have been registered as Sahha profiles
CREATE TABLE public.sahha_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  external_id TEXT NOT NULL,
  profile_token TEXT,
  refresh_token TEXT,
  connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.sahha_connections ENABLE ROW LEVEL SECURITY;

-- Users can read their own row (to know if they're connected). Tokens are still
-- only ever USED inside the edge function (service role); the client just needs
-- to know connection status.
CREATE POLICY "Users can read own sahha connection"
ON public.sahha_connections
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own row (disconnect). Inserts/updates only via edge function.
CREATE POLICY "Users can delete own sahha connection"
ON public.sahha_connections
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Service role full access (edge function uses service role to upsert tokens)
CREATE POLICY "Service role full access sahha connections"
ON public.sahha_connections
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);