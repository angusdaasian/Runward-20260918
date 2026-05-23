INSERT INTO public.terra_connections (user_id, provider, terra_user_id, reference_id, active)
VALUES ('c7a7d1ca-c7bf-4288-bb9d-794006a04087', 'GARMIN', 'f6055d67-772c-47aa-8a82-5633d1fac2b5', 'c7a7d1ca-c7bf-4288-bb9d-794006a04087', true)
ON CONFLICT DO NOTHING;