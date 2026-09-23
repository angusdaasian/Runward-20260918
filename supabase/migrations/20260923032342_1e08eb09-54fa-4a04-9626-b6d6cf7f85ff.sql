CREATE TABLE public.service_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  status text NOT NULL DEFAULT 'operational',
  message text,
  message_zh text,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_statuses_service_name_not_blank CHECK (length(btrim(service_name)) > 0),
  CONSTRAINT service_statuses_status_valid CHECK (status IN ('operational', 'degraded', 'outage', 'maintenance')),
  CONSTRAINT service_statuses_service_name_unique UNIQUE (service_name)
);

GRANT SELECT ON public.service_statuses TO authenticated;
GRANT ALL ON public.service_statuses TO service_role;

ALTER TABLE public.service_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view service statuses"
ON public.service_statuses
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert service statuses"
ON public.service_statuses
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update service statuses"
ON public.service_statuses
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete service statuses"
ON public.service_statuses
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_service_statuses_updated_at
BEFORE UPDATE ON public.service_statuses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();