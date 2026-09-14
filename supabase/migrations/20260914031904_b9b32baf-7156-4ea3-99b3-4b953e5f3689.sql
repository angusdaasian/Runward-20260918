-- 1. Open invites mode
ALTER TABLE public.leaderboard_groups
  ADD COLUMN IF NOT EXISTS member_invite_enabled boolean NOT NULL DEFAULT false;

-- 2. Invitations table
CREATE TABLE IF NOT EXISTS public.group_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.leaderboard_groups(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL,
  invitee_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS group_invitations_pending_uniq
  ON public.group_invitations (group_id, invitee_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS group_invitations_invitee_idx
  ON public.group_invitations (invitee_user_id, status, created_at DESC);

GRANT SELECT ON public.group_invitations TO authenticated;
GRANT ALL ON public.group_invitations TO service_role;

ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invitee or inviter can view invitations"
  ON public.group_invitations FOR SELECT TO authenticated
  USING (invitee_user_id = auth.uid() OR inviter_user_id = auth.uid());

-- 3. Can the current user invite into this group?
CREATE OR REPLACE FUNCTION public.can_invite_to_group(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leaderboard_groups g
    WHERE g.id = p_group_id
      AND (
        g.owner_user_id = p_user_id
        OR (g.member_invite_enabled
            AND EXISTS (SELECT 1 FROM public.leaderboard_group_members m
                        WHERE m.group_id = g.id AND m.user_id = p_user_id))
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.can_invite_to_group(uuid, uuid) TO authenticated, service_role;

-- 4. Owner toggles open invites
CREATE OR REPLACE FUNCTION public.set_group_member_invite(p_group_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leaderboard_groups
     SET member_invite_enabled = p_enabled
   WHERE id = p_group_id AND owner_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the group owner can change invite permissions';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_group_member_invite(uuid, boolean) TO authenticated;

-- 5. Groups the caller may invite a given runner into
CREATE OR REPLACE FUNCTION public.get_invitable_groups(p_target_user_id uuid)
RETURNS TABLE(id uuid, name text, emoji text, can_invite boolean, already_member boolean, already_invited boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id,
         g.name,
         g.emoji,
         public.can_invite_to_group(g.id, auth.uid()) AS can_invite,
         EXISTS (SELECT 1 FROM public.leaderboard_group_members m2
                  WHERE m2.group_id = g.id AND m2.user_id = p_target_user_id) AS already_member,
         EXISTS (SELECT 1 FROM public.group_invitations i
                  WHERE i.group_id = g.id AND i.invitee_user_id = p_target_user_id
                    AND i.status = 'pending') AS already_invited
    FROM public.leaderboard_groups g
    JOIN public.leaderboard_group_members m ON m.group_id = g.id AND m.user_id = auth.uid()
   ORDER BY g.created_at
$$;

GRANT EXECUTE ON FUNCTION public.get_invitable_groups(uuid) TO authenticated;

-- 6. Send an invitation
CREATE OR REPLACE FUNCTION public.invite_user_to_group(p_group_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot invite yourself';
  END IF;
  IF NOT public.can_invite_to_group(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to invite to this group';
  END IF;
  IF EXISTS (SELECT 1 FROM public.leaderboard_group_members
              WHERE group_id = p_group_id AND user_id = p_user_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.group_invitations (group_id, inviter_user_id, invitee_user_id)
  VALUES (p_group_id, auth.uid(), p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_user_to_group(uuid, uuid) TO authenticated;

-- 7. My pending invitations
CREATE OR REPLACE FUNCTION public.get_my_group_invitations()
RETURNS TABLE(id uuid, group_id uuid, group_name text, emoji text, inviter_name text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id,
         i.group_id,
         g.name,
         g.emoji,
         COALESCE(p.display_name, 'Runner'),
         i.created_at
    FROM public.group_invitations i
    JOIN public.leaderboard_groups g ON g.id = i.group_id
    LEFT JOIN public.profiles p ON p.id = i.inviter_user_id
   WHERE i.invitee_user_id = auth.uid()
     AND i.status = 'pending'
   ORDER BY i.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.get_my_group_invitations() TO authenticated;

-- 8. Accept / decline
CREATE OR REPLACE FUNCTION public.respond_group_invitation(p_invitation_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid;
BEGIN
  SELECT group_id INTO v_group
    FROM public.group_invitations
   WHERE id = p_invitation_id AND invitee_user_id = auth.uid() AND status = 'pending';
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  UPDATE public.group_invitations
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
         responded_at = now()
   WHERE id = p_invitation_id;

  IF p_accept THEN
    INSERT INTO public.leaderboard_group_members (group_id, user_id, role)
    VALUES (v_group, auth.uid(), 'member')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_group_invitation(uuid, boolean) TO authenticated;

-- 9. Expose the new flag on my groups
DROP FUNCTION IF EXISTS public.get_my_leaderboard_groups();
CREATE FUNCTION public.get_my_leaderboard_groups()
RETURNS TABLE(id uuid, name text, emoji text, invite_code text, owner_user_id uuid, member_count bigint, push_enabled boolean, member_invite_enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id,
         g.name,
         g.emoji,
         CASE WHEN g.owner_user_id = auth.uid() THEN g.invite_code ELSE NULL END,
         g.owner_user_id,
         (SELECT count(*) FROM public.leaderboard_group_members m2 WHERE m2.group_id = g.id),
         COALESCE(m.push_enabled, true),
         g.member_invite_enabled
    FROM public.leaderboard_groups g
    JOIN public.leaderboard_group_members m ON m.group_id = g.id AND m.user_id = auth.uid()
   ORDER BY g.created_at
$$;

GRANT EXECUTE ON FUNCTION public.get_my_leaderboard_groups() TO authenticated;