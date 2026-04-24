ALTER TABLE public.garmin_connections
  ADD COLUMN IF NOT EXISTS oauth1_token_encrypted text,
  ADD COLUMN IF NOT EXISTS oauth2_token_encrypted text;