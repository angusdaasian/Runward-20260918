
CREATE TABLE public.promo_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  link_url TEXT,
  caption TEXT,
  caption_zh TEXT,
  display_order INT NOT NULL DEFAULT 0,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active promo banners"
  ON public.promo_banners
  FOR SELECT
  USING (is_active = true AND ends_at > now());

CREATE POLICY "Admins can view all promo banners"
  ON public.promo_banners
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert promo banners"
  ON public.promo_banners
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update promo banners"
  ON public.promo_banners
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete promo banners"
  ON public.promo_banners
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER promo_banners_updated_at
  BEFORE UPDATE ON public.promo_banners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('promo-banners', 'promo-banners', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view promo banner images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'promo-banners');

CREATE POLICY "Admins can upload promo banner images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'promo-banners' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update promo banner images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'promo-banners' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete promo banner images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'promo-banners' AND public.has_role(auth.uid(), 'admin'));
