-- 1. Add vault id columns
ALTER TABLE public.strava_apps
  ADD COLUMN IF NOT EXISTS client_secret_vault_id uuid,
  ADD COLUMN IF NOT EXISTS verify_token_vault_id uuid;

-- 2. Reader: returns decrypted secrets for an app
CREATE OR REPLACE FUNCTION public.get_strava_app_secrets(p_app_id uuid)
RETURNS TABLE(client_secret text, verify_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_cs_id uuid;
  v_vt_id uuid;
BEGIN
  SELECT a.client_secret_vault_id, a.verify_token_vault_id
    INTO v_cs_id, v_vt_id
  FROM public.strava_apps a
  WHERE a.id = p_app_id;

  RETURN QUERY
  SELECT
    (SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.id = v_cs_id),
    (SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.id = v_vt_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_strava_app_secrets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_strava_app_secrets(uuid) TO service_role;

-- 3. Writer: upserts a vault secret and links it on the app row
CREATE OR REPLACE FUNCTION public.set_strava_app_secret(
  p_app_id uuid,
  p_kind text,
  p_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_existing uuid;
  v_new uuid;
  v_name text;
BEGIN
  IF p_kind NOT IN ('client_secret', 'verify_token') THEN
    RAISE EXCEPTION 'invalid kind: %', p_kind;
  END IF;

  v_name := 'strava_app_' || p_app_id::text || '_' || p_kind;

  IF p_kind = 'client_secret' THEN
    SELECT client_secret_vault_id INTO v_existing FROM public.strava_apps WHERE id = p_app_id;
  ELSE
    SELECT verify_token_vault_id INTO v_existing FROM public.strava_apps WHERE id = p_app_id;
  END IF;

  IF v_existing IS NULL THEN
    v_new := vault.create_secret(p_value, v_name, 'Strava app credential');
    IF p_kind = 'client_secret' THEN
      UPDATE public.strava_apps
        SET client_secret_vault_id = v_new, client_secret = NULL
        WHERE id = p_app_id;
    ELSE
      UPDATE public.strava_apps
        SET verify_token_vault_id = v_new, verify_token = NULL
        WHERE id = p_app_id;
    END IF;
  ELSE
    PERFORM vault.update_secret(v_existing, p_value, v_name, 'Strava app credential');
    IF p_kind = 'client_secret' THEN
      UPDATE public.strava_apps SET client_secret = NULL WHERE id = p_app_id;
    ELSE
      UPDATE public.strava_apps SET verify_token = NULL WHERE id = p_app_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_strava_app_secret(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_strava_app_secret(uuid, text, text) TO service_role;

-- 4. Backfill existing plaintext values into vault
DO $$
DECLARE
  r record;
  v_id uuid;
BEGIN
  FOR r IN SELECT id, client_secret, verify_token FROM public.strava_apps LOOP
    IF r.client_secret IS NOT NULL AND length(trim(r.client_secret)) > 0 THEN
      v_id := vault.create_secret(
        r.client_secret,
        'strava_app_' || r.id::text || '_client_secret',
        'Strava app credential (backfilled)'
      );
      UPDATE public.strava_apps
        SET client_secret_vault_id = v_id, client_secret = NULL
        WHERE id = r.id;
    END IF;
    IF r.verify_token IS NOT NULL AND length(trim(r.verify_token)) > 0 THEN
      v_id := vault.create_secret(
        r.verify_token,
        'strava_app_' || r.id::text || '_verify_token',
        'Strava app credential (backfilled)'
      );
      UPDATE public.strava_apps
        SET verify_token_vault_id = v_id, verify_token = NULL
        WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;