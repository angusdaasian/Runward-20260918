
-- Allow admins to read all profiles
CREATE POLICY "Admins can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all premium subscriptions
CREATE POLICY "Admins can read all subscriptions"
ON public.premium_subscriptions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
