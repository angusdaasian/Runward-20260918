import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, MessageCircle, MoreVertical, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useGroupChat } from "@/hooks/use-group-chat";
import GroupChatMessage from "./GroupChatMessage";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type LeaderboardGroup } from "./GroupManager";
import GroupMembersDialog from "./GroupMembersDialog";
import type { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  group: { id: string; name: string; emoji: string | null; member_count: number };
  managerGroups: LeaderboardGroup[];
  onBack: () => void;
  onGroupsChanged: () => void;
}

const dayKey = (iso: string) => new Date(iso).toDateString();

export default function GroupChatRoom({ lang, group, managerGroups, onBack, onGroupsChanged }: Props) {
  const zh = lang === "zh";
  const { toast } = useToast();
  const { messages, loading, loadingOlder, hasMore, sending, send, remove, retry, loadOlder } = useGroupChat(group.id);
  const [draft, setDraft] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") =>
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });

  useEffect(() => {
    if (!loading && atBottom) scrollToBottom(messages.length > 40 ? "auto" : "smooth");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, loading]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
    if (el.scrollTop < 40 && hasMore && !loadingOlder) void loadOlder();
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (text.length > 1000) {
      toast({ title: zh ? "訊息太長（上限 1000 字）" : "Message too long (1000 characters max)", variant: "destructive" });
      return;
    }
    setDraft("");
    setAtBottom(true);
    await send(text);
  };

  const handleDelete = async (id: string) => {
    const ok = await remove(id);
    if (!ok) toast({ title: zh ? "未能刪除訊息" : "Could not delete message", variant: "destructive" });
  };

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[24rem] flex-col overflow-hidden rounded-xl border border-border bg-background">
      <header className="flex items-center gap-2 border-b border-border bg-card px-2 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={zh ? "返回" : "Back"}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {group.emoji} {group.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {group.member_count} {zh ? "位成員" : "members"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={zh ? "群組選項" : "Group options"}>
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setManageOpen(true)}>
              <Users />
              {zh ? "管理群組" : "Manage group"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <GroupMembersDialog
          lang={lang}
          open={manageOpen}
          onOpenChange={setManageOpen}
          group={group}
          managerGroup={managerGroups.find((g) => g.id === group.id)}
          onChanged={onGroupsChanged}
          onLeft={onBack}
        />
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {loadingOlder && (
          <p className="text-center text-xs text-muted-foreground">
            <Loader2 className="inline size-3 animate-spin" /> {zh ? "載入更早訊息" : "Loading older messages"}
          </p>
        )}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageCircle className="text-muted-foreground" size={26} />
            <p className="text-sm text-muted-foreground">
              {zh ? "還沒有訊息，跟跑班打個招呼吧！" : "No messages yet — say hi to your group!"}
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const prev = messages[index - 1];
            const newDay = !prev || dayKey(prev.created_at) !== dayKey(message.created_at);
            const showAuthor = newDay || !prev || prev.user_id !== message.user_id;
            return (
              <div key={message.id} className="space-y-2">
                {newDay && (
                  <p className="py-1 text-center text-[11px] text-muted-foreground">
                    {new Date(message.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                )}
                <GroupChatMessage
                  lang={lang}
                  message={message}
                  showAuthor={showAuthor}
                  onDelete={handleDelete}
                  onRetry={retry}
                />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {!atBottom && messages.length > 0 && (
        <button
          onClick={() => {
            setAtBottom(true);
            scrollToBottom();
          }}
          className="mx-auto -mt-12 mb-2 flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm"
        >
          <ChevronDown size={14} />
          {zh ? "最新訊息" : "Latest"}
        </button>
      )}

      <div className="flex items-end gap-2 border-t border-border bg-card p-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder={zh ? "傳送訊息…" : "Send a message…"}
          className="max-h-28 min-h-10 resize-none"
        />
        <Button size="icon" onClick={submit} disabled={sending || !draft.trim()} aria-label={zh ? "傳送" : "Send"}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
    </div>
  );
}
