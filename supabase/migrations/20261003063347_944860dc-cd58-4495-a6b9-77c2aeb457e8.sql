ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'info';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
GRANT SELECT ON public.announcements TO anon, authenticated;