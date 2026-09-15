import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { GroupChatMessage as ChatMessage } from "@/hooks/use-group-chat";
import type { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  message: ChatMessage;
  showAuthor: boolean;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function GroupChatMessage({ lang, message, showAuthor, onDelete, onRetry }: Props) {
  const zh = lang === "zh";
  const mine = message.is_mine;

  const bubble = (
    <div
      className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
        mine
          ? "rounded-br-md bg-primary text-primary-foreground"
          : "rounded-bl-md border border-border bg-card text-foreground"
      } ${message.pending ? "opacity-70" : ""} ${message.failed ? "border-destructive" : ""}`}
    >
      <p className="whitespace-pre-wrap break-words">{message.body}</p>
      <span className={`mt-1 block text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
        {message.pending ? (
          <Loader2 className="inline size-3 animate-spin" />
        ) : message.failed ? (
          zh ? "傳送失敗" : "Failed"
        ) : (
          time(message.created_at)
        )}
      </span>
    </div>
  );

  return (
    <div className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine && (
        <div className="w-7 shrink-0">
          {showAuthor && (
            <Avatar className="size-7">
              <AvatarImage src={message.avatar_url || undefined} />
              <AvatarFallback className="text-[10px]">{(message.display_name || "R")[0]}</AvatarFallback>
            </Avatar>
          )}
        </div>
      )}
      <div className={`flex min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
        {!mine && showAuthor && (
          <span className="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground">
            {message.display_name || (zh ? "跑者" : "Runner")}
          </span>
        )}
        {message.failed ? (
          <button onClick={() => onRetry(message.id)} className="flex items-center gap-1.5">
            {bubble}
            <RotateCcw size={13} className="text-destructive" />
          </button>
        ) : message.can_delete && !message.pending ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label={zh ? "訊息選項" : "Message options"}>{bubble}</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={mine ? "end" : "start"}>
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(message.id)}>
                <Trash2 />
                {zh ? "刪除訊息" : "Delete message"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          bubble
        )}
      </div>
    </div>
  );
}
