import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface GroupChatSummary {
  group_id: string;
  name: string;
  emoji: string | null;
  member_count: number;
  last_body: string | null;
  last_at: string | null;
  last_sender: string | null;
  unread_count: number;
}

/** Group rows for the chat list, with last message preview and unread counts. */
export function useGroupChatSummaries() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<GroupChatSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setSummaries([]);
      setLoading(false);
      return;
    }
    const { data } = await (supabase.rpc as any)("get_my_group_chat_summaries");
    setSummaries((data || []) as GroupChatSummary[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalUnread = summaries.reduce((sum, s) => sum + Number(s.unread_count || 0), 0);

  return { summaries, loading, reload, totalUnread };
}
