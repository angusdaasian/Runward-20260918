INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = '6hhxbmqfy7@privaterelay.appleid.com'
ON CONFLICT (user_id, role) DO NOTHING;