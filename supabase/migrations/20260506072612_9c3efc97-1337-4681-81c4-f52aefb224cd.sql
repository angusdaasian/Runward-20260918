-- Drop unused plaintext token columns from garmin_connections.
-- The encrypted oauth1/oauth2 columns remain as the real auth state.
ALTER TABLE public.garmin_connections
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token,
  DROP COLUMN IF EXISTS token_type,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS refresh_token_expires_at;

-- Sahha is no longer used — drop the connections table entirely.
DROP TABLE IF EXISTS public.sahha_connections;