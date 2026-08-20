ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS translation_slug text;