UPDATE public.premium_subscriptions
SET expires_at = '2026-05-24 09:45:00+00',
    is_trial = true,
    rc_entitlement = 'premium'
WHERE user_id = '0ed6a94b-1e42-479d-ad51-468c007310e8';

UPDATE public.profiles
SET is_premium = true
WHERE user_id = '0ed6a94b-1e42-479d-ad51-468c007310e8';