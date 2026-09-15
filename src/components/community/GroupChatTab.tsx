import { useCallback, useEffect, useState } from "react";
import { ChevronRight, MessageCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupChatSummaries } from "@/hooks/use-group-chat-summaries";
import GroupChatRoom from "./GroupChatRoom";
import GroupManager, { type LeaderboardGroup } from "./GroupManager";
import type { Lang } from "@/lib/i18n";

const preview = (iso: string) => {
  const date = new Date(iso);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function GroupChatTab({ lang }: { lang: Lang }) {
  const zh = lang === "zh";
  const { user } = useAuth();
  const { summaries, loading, reload } = useGroupChatSummaries();
  const [groups, setGroups] = useState<LeaderboardGroup[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc("get_my_leaderboard_groups");
    setGroups((data || []) as LeaderboardGroup[]);
    await reload();
  }, [user, reload]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  if (!user) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {zh ? "請登入以使用群組聊天" : "Sign in to use group chat"}
      </div>
    );
  }

  const open = summaries.find((s) => s.group_id === openId);
  if (open) {
    return (
      <GroupChatRoom
        lang={lang}
        group={{ id: open.group_id, name: open.name, emoji: open.emoji, member_count: Number(open.member_count) }}
        managerGroups={groups}
        onBack={() => {
          setOpenId(null);
          void loadGroups();
        }}
        onGroupsChanged={loadGroups}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-5 py-10 text-center">
        <MessageCircle className="text-muted-foreground" size={26} />
        <p className="text-sm font-semibold text-foreground">{zh ? "還沒有跑班" : "No running groups yet"}</p>
        <p className="max-w-[16rem] text-xs text-muted-foreground">
          {zh
            ? "建立或加入跑班後，就可以在這裡跟班友私人聊天。"
            : "Create or join a group to chat privately with your running buddies."}
        </p>
        <GroupManager lang={lang} groups={groups} onChanged={loadGroups} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <GroupManager lang={lang} groups={groups} onChanged={loadGroups} />
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {summaries.map((summary) => {
          const unread = Number(summary.unread_count || 0);
          return (
            <button
              key={summary.group_id}
              onClick={() => setOpenId(summary.group_id)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-lg">
                {summary.emoji || "🏃"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{summary.name}</p>
                  {summary.last_at && (
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{preview(summary.last_at)}</span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {summary.last_body ? (
                    <>
                      {summary.last_sender ? `${summary.last_sender}: ` : ""}
                      {summary.last_body}
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} />
                      {summary.member_count} {zh ? "位成員 · 尚無訊息" : "members · no messages yet"}
                    </span>
                  )}
                </p>
              </div>
              {unread > 0 ? (
                <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : (
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
