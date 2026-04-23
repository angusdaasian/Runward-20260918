
-- ============================================================
-- 1. STORAGE POLICIES — avatars & promo-banners
-- ============================================================

-- Drop any prior broad policies on these buckets (idempotent)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: public read individual" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: owner update" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: owner delete" ON storage.objects;

DROP POLICY IF EXISTS "Promo banners are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public can view promo banners" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view promo banners" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload promo banners" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update promo banners" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete promo banners" ON storage.objects;
DROP POLICY IF EXISTS "Promo banners: public read individual" ON storage.objects;
DROP POLICY IF EXISTS "Promo banners: admin insert" ON storage.objects;
DROP POLICY IF EXISTS "Promo banners: admin update" ON storage.objects;
DROP POLICY IF EXISTS "Promo banners: admin delete" ON storage.objects;

-- ----- AVATARS -----
-- Public can SELECT individual objects (needed for getPublicUrl serving),
-- but listing the bucket still requires matching the folder rule.
CREATE POLICY "Avatars: public read individual"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Avatars: owner insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Avatars: owner update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Avatars: owner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ----- PROMO-BANNERS -----
-- Public can read individual files (banners shown in the app),
-- writes restricted to admins only.
CREATE POLICY "Promo banners: public read individual"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'promo-banners');

CREATE POLICY "Promo banners: admin insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'promo-banners'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Promo banners: admin update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'promo-banners'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Promo banners: admin delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'promo-banners'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- ============================================================
-- 2. REALTIME PUBLICATION — remove Strava tables
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'strava_activities'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.strava_activities';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'strava_connections'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.strava_connections';
  END IF;
END $$;
