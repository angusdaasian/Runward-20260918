import { useEffect, useRef, useState } from "react";
import { X, Settings, Send, ChevronDown, Loader2, Plus, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAICoach } from "@/hooks/use-ai-coach";
import { useAuth } from "@/contexts/AuthContext";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import ContextBar from "./ContextBar";
import CoachSettings from "./CoachSettings";

interface Props {
  open: boolean;
  onClose: () => void;
  lang: "en" | "zh";
}

const ChatModal = ({ open, onClose, lang }: Props) => {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    sending,
    remaining,
    prefs,
    insights,
    sessions,
    loadingHistory,
    sessionId,
    send,
    newConversation,
    switchSession,
    deleteSession,
    savePreferences,
    resetMemory,
  } = useAICoach(open);

  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, sending]);

  useEffect(() => {
    if (open && !sending) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open, sending]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || sending || remaining === 0) return;
    const text = input;
    setInput("");
    send(text);
  };

  if (!open) return null;

  const limitReached = remaining === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/40 animate-in fade-in-0 duration-200"
        onClick={onClose}
      />
      {/* Modal — floating card on all screen sizes */}
      <div
        className="fixed z-[9999] bg-background border border-border shadow-2xl flex flex-col rounded-2xl overflow-hidden
          left-3 right-3 bottom-3 top-auto h-[80vh] max-h-[calc(100vh-1.5rem)]
          sm:left-auto sm:right-6 sm:bottom-6 sm:w-[500px] sm:h-[700px] sm:max-h-[calc(100vh-3rem)]
          animate-in slide-in-from-bottom-4 sm:fade-in-0 sm:zoom-in-95 duration-300"
        style={{
          paddingTop: "var(--safe-area-top, 0px)",
          paddingBottom: "var(--safe-area-bottom, 0px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
              <span className="text-base">🏃</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">
                {t("AI Running Coach", "AI 跑步教練")}
              </h3>
              {remaining !== null && (
                <p className="text-[10px] text-muted-foreground">
                  {t(
                    `${remaining} messages left today`,
                    `今日剩餘 ${remaining} 則訊息`,
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Popover open={sessionMenuOpen} onOpenChange={setSessionMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={t("Conversations", "對話記錄")}
                >
                  <ChevronDown size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-72 p-1 z-[10000]"
                sideOffset={6}
              >
                <button
                  onClick={() => {
                    newConversation();
                    setSessionMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted text-sm text-left"
                >
                  <Plus size={14} />
                  <span className="font-medium">
                    {t("New conversation", "新對話")}
                  </span>
                </button>
                {sessions.length > 0 && (
                  <div className="my-1 h-px bg-border" />
                )}
                <div className="max-h-72 overflow-y-auto">
                  {sessions.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                      {t("No previous chats", "沒有過往對話")}
                    </div>
                  ) : (
                    sessions.map((s) => {
                      const isActive = s.session_id === sessionId;
                      const date = new Date(s.last_at);
                      const dateLabel = date.toLocaleDateString(
                        lang === "zh" ? "zh-HK" : "en-US",
                        { month: "short", day: "numeric" },
                      );
                      return (
                        <div
                          key={s.session_id}
                          className={`group flex items-center gap-1 rounded-md ${
                            isActive ? "bg-muted" : "hover:bg-muted/60"
                          }`}
                        >
                          <button
                            onClick={() => {
                              switchSession(s.session_id);
                              setSessionMenuOpen(false);
                            }}
                            className="flex-1 flex items-start gap-2 px-2 py-2 text-left min-w-0"
                          >
                            <MessageSquare
                              size={14}
                              className="mt-0.5 shrink-0 text-muted-foreground"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">
                                {s.first_user_message ||
                                  t("(empty)", "（空對話）")}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {dateLabel} · {s.message_count}{" "}
                                {t("msgs", "則")}
                              </p>
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                confirm(
                                  t(
                                    "Delete this conversation?",
                                    "刪除此對話？",
                                  ),
                                )
                              ) {
                                deleteSession(s.session_id);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 mr-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                            title={t("Delete", "刪除")}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowSettings(true)}
              title={t("Settings", "設定")}
            >
              <Settings size={16} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        <ContextBar prefs={prefs} insights={insights} lang={lang} />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 px-4 space-y-3">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mx-auto">
                <span className="text-3xl">🏃</span>
              </div>
              <h4 className="font-semibold">
                {t("Hi! I'm your AI Running Coach", "嗨！我是你的 AI 跑步教練")}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Ask me anything about your training, recovery, race prep, or technique.",
                  "問我任何關於訓練、恢復、比賽準備或技巧的問題。",
                )}
              </p>
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                {[
                  t("Should I run today?", "我今天該跑嗎？"),
                  t("How was my last run?", "我上次跑得如何？"),
                  t("Build me a weekly plan", "幫我規劃一週訓練"),
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) =>
              m.pending ? (
                <TypingIndicator key={m.id} />
              ) : (
                <MessageBubble key={m.id} role={m.role} content={m.content} />
              ),
            )
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="border-t border-border p-3 flex gap-2 shrink-0"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              limitReached
                ? t("Daily limit reached — resets at midnight", "已達每日上限")
                : t("Ask your coach anything...", "問你的教練任何問題...")
            }
            disabled={sending || limitReached}
            maxLength={2000}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || sending || limitReached}
          >
            {sending ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Send size={16} />
            )}
          </Button>
        </form>
      </div>

      <CoachSettings
        open={showSettings}
        onOpenChange={setShowSettings}
        prefs={prefs}
        insights={insights}
        onSave={savePreferences}
        onResetMemory={resetMemory}
        lang={lang}
      />
    </>
  );
};

export default ChatModal;
