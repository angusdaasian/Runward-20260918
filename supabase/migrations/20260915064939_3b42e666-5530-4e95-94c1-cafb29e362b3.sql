CREATE OR REPLACE FUNCTION public.get_group_chat_push_recipients(p_group_id uuid, p_exclude_user uuid)
RETURNS TABLE(user_id uuid, lang text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id, p.lang
  FROM public.leaderboard_group_members m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.group_id = p_group_id
    AND m.user_id <> p_exclude_user
    AND coalesce(m.push_enabled, true) = true
$$;

REVOKE ALL ON FUNCTION public.get_group_chat_push_recipients(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_chat_push_recipients(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_notify_group_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1;
  IF v_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/notify-group-message',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-key', v_key),
    body := jsonb_build_object('message_id', NEW.id::text),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_group_message ON public.group_messages;
CREATE TRIGGER trg_notify_group_message
AFTER INSERT ON public.group_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_group_message();