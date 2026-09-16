CREATE TABLE public.activity_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  activity_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'strava',
  storage_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_photos TO authenticated;
GRANT ALL ON public.activity_photos TO service_role;

ALTER TABLE public.activity_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own activity photos"
  ON public.activity_photos FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_activity_photos_user_activity
  ON public.activity_photos (user_id, activity_id, sort_order);

CREATE TRIGGER update_activity_photos_updated_at
  BEFORE UPDATE ON public.activity_photos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users read own activity photo files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'activity-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own activity photo files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'activity-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own activity photo files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'activity-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own activity photo files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'activity-photos' AND auth.uid()::text = (storage.foldername(name))[1]);