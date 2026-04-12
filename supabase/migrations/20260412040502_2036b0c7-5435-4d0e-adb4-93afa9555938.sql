CREATE POLICY "Users can update own apple health activities"
ON public.apple_health_activities
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own apple health activities"
ON public.apple_health_activities
FOR DELETE
USING (auth.uid() = user_id);