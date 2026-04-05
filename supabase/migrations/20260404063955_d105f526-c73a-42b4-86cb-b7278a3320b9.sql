ALTER TABLE public.races 
ADD COLUMN registration_info text DEFAULT NULL,
ADD COLUMN source text DEFAULT NULL;