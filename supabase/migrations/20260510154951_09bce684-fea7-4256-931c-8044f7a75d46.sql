INSERT INTO public.user_roles (user_id, role)
VALUES ('c7a7d1ca-c7bf-4288-bb9d-794006a04087', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;