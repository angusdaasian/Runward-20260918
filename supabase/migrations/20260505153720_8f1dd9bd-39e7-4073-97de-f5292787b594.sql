INSERT INTO public.premium_subscriptions (user_id, plan, expires_at, activated_at, rc_entitlement, is_trial)
VALUES ('56eb61d6-1320-4991-b31d-6fd9a89220fb', 'lifetime', '2099-12-31T23:59:59Z', now(), 'premium', false)
ON CONFLICT (user_id) DO UPDATE SET plan='lifetime', expires_at='2099-12-31T23:59:59Z', activated_at=now(), rc_entitlement='premium', is_trial=false;

UPDATE public.profiles SET is_premium=true WHERE user_id='56eb61d6-1320-4991-b31d-6fd9a89220fb';