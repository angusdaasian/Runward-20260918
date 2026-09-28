ALTER TABLE public.stridee_connections ALTER COLUMN auto_sync_enabled SET DEFAULT true;
UPDATE public.stridee_connections SET auto_sync_enabled = true WHERE auto_sync_enabled = false;