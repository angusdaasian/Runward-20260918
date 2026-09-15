import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface GroupChatMessage {
  id: string;
  group_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  body: string;
  created_at: string;
  is_mine: boolean;
  can_delete: boolean;
  pending?: boolean;
  failed?: boolean;
}

const PAGE_SIZE = 40;

/** Loads, paginates and live-subscribes a single group's chat. */
export function useGroupChat(groupId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const oldestRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    async (before: string | null) => {
      const { data, error } = await (supabase.rpc as any)("get_group_messages", {
        p_group_id: groupId,
        p_before: before,
        p_limit: PAGE_SIZE,
      });
      if (error) return [] as GroupChatMessage[];
      const rows = ((data || []) as GroupChatMessage[]).slice().reverse();
      setHasMore((data || []).length === PAGE_SIZE);
      if (rows.length) oldestRef.current = rows[0].created_at;
      return rows;
    },
    [groupId]
  );

  const markRead = useCallback(async () => {
    if (!groupId) return;
    await (supabase.rpc as any)("mark_group_chat_read", { p_group_id: groupId });
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !user) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    oldestRef.current = null;
    (async () => {
      const rows = await fetchPage(null);
      if (cancelled) return;
      setMessages(rows);
      setLoading(false);
      void markRead();
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, user, fetchPage, markRead]);

  // Live updates for this group's chat.
  useEffect(() => {
    if (!groupId || !user) return;
    const channel = supabase
      .channel(`group-chat:${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const row = payload.new as { id: string; user_id: string };
          if (row.user_id === user.id) return; // already shown optimistically
          const { data } = await (supabase.rpc as any)("get_group_messages", {
            p_group_id: groupId,
            p_before: null,
            p_limit: 1,
          });
          const latest = (data || [])[0] as GroupChatMessage | undefined;
          if (!latest) return;
          setMessages((prev) => (prev.some((m) => m.id === latest.id) ? prev : [...prev, latest]));
          void markRead();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as { id: string; deleted_at: string | null };
          if (row.deleted_at) setMessages((prev) => prev.filter((m) => m.id !== row.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, user, markRead]);

  const loadOlder = useCallback(async () => {
    if (!groupId || loadingOlder || !hasMore || !oldestRef.current) return;
    setLoadingOlder(true);
    const rows = await fetchPage(oldestRef.current);
    setMessages((prev) => [...rows, ...prev]);
    setLoadingOlder(false);
  }, [groupId, hasMore, loadingOlder, fetchPage]);

  const send = useCallback(
    async (body: string) => {
      const text = body.trim();
      if (!groupId || !user || !text) return;
      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          group_id: groupId,
          user_id: user.id,
          display_name: null,
          avatar_url: null,
          body: text,
          created_at: new Date().toISOString(),
          is_mine: true,
          can_delete: true,
          pending: true,
        },
      ]);
      setSending(true);
      const { data, error } = await (supabase.rpc as any)("send_group_message", {
        p_group_id: groupId,
        p_body: text,
      });
      setSending(false);
      const saved = (data || [])[0] as GroupChatMessage | undefined;
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== tempId ? m : error || !saved ? { ...m, pending: false, failed: true } : { ...saved, is_mine: true, can_delete: true }
        )
      );
    },
    [groupId, user]
  );

  const remove = useCallback(async (messageId: string) => {
    const { error } = await (supabase.rpc as any)("delete_group_message", { p_message_id: messageId });
    if (!error) setMessages((prev) => prev.filter((m) => m.id !== messageId));
    return !error;
  }, []);

  const retry = useCallback(
    (messageId: string) => {
      const failed = messages.find((m) => m.id === messageId);
      if (!failed) return;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      void send(failed.body);
    },
    [messages, send]
  );

  return { messages, loading, loadingOlder, hasMore, sending, send, remove, retry, loadOlder, markRead };
}
