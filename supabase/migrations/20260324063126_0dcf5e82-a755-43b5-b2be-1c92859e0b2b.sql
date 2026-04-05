-- Allow admins to insert premium subscriptions for any user
CREATE POLICY "Admins can insert subscriptions"
ON public.premium_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update any subscription
CREATE POLICY "Admins can update subscriptions"
ON public.premium_subscriptions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete any subscription
CREATE POLICY "Admins can delete subscriptions"
ON public.premium_subscriptions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));