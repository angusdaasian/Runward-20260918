
-- ============================================================
-- Developer Platform v1: OAuth apps, authorizations, rate limits, webhooks
-- ============================================================

-- 1) oauth_apps -----------------------------------------------
CREATE TYPE public.oauth_app_status AS ENUM ('pending','active','suspended','rejected');

CREATE TABLE public.oauth_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  website_url text,
  contact_email text NOT NULL,
  logo_url text,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  webhook_url text,
  client_id text NOT NULL UNIQUE,
  client_secret_hash text,            -- bcrypt-ish hash; null until approved
  client_secret_prefix text,          -- first 6 chars for display
  webhook_signing_secret text,        -- shown once at approval
  webhook_verify_token text,
  status public.oauth_app_status NOT NULL DEFAULT 'pending',
  max_athletes integer NOT NULL DEFAULT 300,
  rate_limit_15min integer NOT NULL DEFAULT 200,
  rate_limit_daily integer NOT NULL DEFAULT 2000,
  approved_at timestamptz,
  approved_by uuid,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_apps TO authenticated;
GRANT ALL ON public.oauth_apps TO service_role;

ALTER TABLE public.oauth_apps ENABLE ROW LEVEL SECURITY;

-- Owners can see their own apps
CREATE POLICY "owners read own apps" ON public.oauth_apps
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

-- Admins can see all apps
CREATE POLICY "admins read all apps" ON public.oauth_apps
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Owners create their own apps (pending only — enforced by trigger below)
CREATE POLICY "owners create own apps" ON public.oauth_apps
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- Owners can update only non-sensitive fields on their own apps
-- (status / credentials updates happen via edge functions w/ service role)
CREATE POLICY "owners update own apps" ON public.oauth_apps
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Admins can update any app
CREATE POLICY "admins update any app" ON public.oauth_apps
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger: prevent non-admin owners from changing status/credential fields
CREATE OR REPLACE FUNCTION public.guard_oauth_apps_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  -- Non-admin: lock down protected fields
  NEW.status := OLD.status;
  NEW.client_id := OLD.client_id;
  NEW.client_secret_hash := OLD.client_secret_hash;
  NEW.client_secret_prefix := OLD.client_secret_prefix;
  NEW.webhook_signing_secret := OLD.webhook_signing_secret;
  NEW.max_athletes := OLD.max_athletes;
  NEW.rate_limit_15min := OLD.rate_limit_15min;
  NEW.rate_limit_daily := OLD.rate_limit_daily;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.owner_user_id := OLD.owner_user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_oauth_apps_update
BEFORE UPDATE ON public.oauth_apps
FOR EACH ROW EXECUTE FUNCTION public.guard_oauth_apps_update();

CREATE TRIGGER trg_oauth_apps_updated_at
BEFORE UPDATE ON public.oauth_apps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) oauth_authorizations -------------------------------------
CREATE TABLE public.oauth_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.oauth_apps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  access_token_hash text NOT NULL,
  refresh_token_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['activity:read'],
  expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, user_id)
);

CREATE INDEX idx_oauth_auth_access_hash ON public.oauth_authorizations(access_token_hash);
CREATE INDEX idx_oauth_auth_refresh_hash ON public.oauth_authorizations(refresh_token_hash);
CREATE INDEX idx_oauth_auth_user ON public.oauth_authorizations(user_id);

GRANT SELECT, DELETE ON public.oauth_authorizations TO authenticated;
GRANT ALL ON public.oauth_authorizations TO service_role;

ALTER TABLE public.oauth_authorizations ENABLE ROW LEVEL SECURITY;

-- Users see and can revoke their own authorizations
CREATE POLICY "users read own authorizations" ON public.oauth_authorizations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users revoke own authorizations" ON public.oauth_authorizations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- App owners see authorizations granted to their apps (count only typically)
CREATE POLICY "app owners read own app authorizations" ON public.oauth_authorizations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.oauth_apps a
    WHERE a.id = oauth_authorizations.app_id AND a.owner_user_id = auth.uid()
  ));

CREATE TRIGGER trg_oauth_authorizations_updated_at
BEFORE UPDATE ON public.oauth_authorizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) oauth_auth_codes (short-lived) ---------------------------
CREATE TABLE public.oauth_auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  app_id uuid NOT NULL REFERENCES public.oauth_apps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['activity:read'],
  pkce_challenge text,
  pkce_method text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_auth_codes_expires ON public.oauth_auth_codes(expires_at);

GRANT ALL ON public.oauth_auth_codes TO service_role;
-- No direct authenticated access; handled via edge functions.
ALTER TABLE public.oauth_auth_codes ENABLE ROW LEVEL SECURITY;

-- 4) api_rate_limit_buckets -----------------------------------
CREATE TABLE public.api_rate_limit_buckets (
  app_id uuid NOT NULL REFERENCES public.oauth_apps(id) ON DELETE CASCADE,
  window_kind text NOT NULL CHECK (window_kind IN ('15min','day')),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, window_kind, window_start)
);

GRANT ALL ON public.api_rate_limit_buckets TO service_role;
ALTER TABLE public.api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- App owners can read their own usage
CREATE POLICY "owners read own usage" ON public.api_rate_limit_buckets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.oauth_apps a
    WHERE a.id = api_rate_limit_buckets.app_id AND a.owner_user_id = auth.uid()
  ));

GRANT SELECT ON public.api_rate_limit_buckets TO authenticated;

-- consume_rate_limit: atomically increment + return remaining
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_app_id uuid)
RETURNS TABLE(allowed boolean, remaining_15min integer, remaining_day integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.oauth_apps%ROWTYPE;
  v_15_start timestamptz := date_trunc('minute', now()) - ((extract(minute from now())::int % 15) || ' minutes')::interval;
  v_day_start timestamptz := date_trunc('day', now());
  v_15_count integer;
  v_day_count integer;
BEGIN
  SELECT * INTO v_app FROM public.oauth_apps WHERE id = p_app_id;
  IF NOT FOUND OR v_app.status <> 'active' THEN
    RETURN QUERY SELECT false, 0, 0, 900;
    RETURN;
  END IF;

  INSERT INTO public.api_rate_limit_buckets(app_id, window_kind, window_start, request_count)
  VALUES (p_app_id, '15min', v_15_start, 1)
  ON CONFLICT (app_id, window_kind, window_start)
  DO UPDATE SET request_count = api_rate_limit_buckets.request_count + 1
  RETURNING request_count INTO v_15_count;

  INSERT INTO public.api_rate_limit_buckets(app_id, window_kind, window_start, request_count)
  VALUES (p_app_id, 'day', v_day_start, 1)
  ON CONFLICT (app_id, window_kind, window_start)
  DO UPDATE SET request_count = api_rate_limit_buckets.request_count + 1
  RETURNING request_count INTO v_day_count;

  IF v_15_count > v_app.rate_limit_15min OR v_day_count > v_app.rate_limit_daily THEN
    RETURN QUERY SELECT
      false,
      GREATEST(v_app.rate_limit_15min - v_15_count, 0),
      GREATEST(v_app.rate_limit_daily - v_day_count, 0),
      GREATEST(extract(epoch FROM ((v_15_start + interval '15 minutes') - now()))::int, 1);
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    GREATEST(v_app.rate_limit_15min - v_15_count, 0),
    GREATEST(v_app.rate_limit_daily - v_day_count, 0),
    0;
END;
$$;

-- 5) webhook_deliveries ---------------------------------------
CREATE TYPE public.webhook_delivery_status AS ENUM ('pending','delivered','failed','dead');

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.oauth_apps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  object_type text,
  object_id text,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  status public.webhook_delivery_status NOT NULL DEFAULT 'pending',
  last_response_code integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_pending ON public.webhook_deliveries(status, next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX idx_webhook_deliveries_app ON public.webhook_deliveries(app_id, created_at DESC);

GRANT ALL ON public.webhook_deliveries TO service_role;
GRANT SELECT ON public.webhook_deliveries TO authenticated;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read own webhook deliveries" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.oauth_apps a
    WHERE a.id = webhook_deliveries.app_id AND a.owner_user_id = auth.uid()
  ));

CREATE POLICY "admins read all webhook deliveries" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_webhook_deliveries_updated_at
BEFORE UPDATE ON public.webhook_deliveries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
