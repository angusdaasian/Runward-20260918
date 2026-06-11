import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Lang } from "@/lib/i18n";

const BOT_USERNAME = "runward_coach_bot";

function makeCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function TelegramConnectCard({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkedChatId, setLinkedChatId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("telegram_chat_id, telegram_daily_workout")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setLinkedChatId((data as any).telegram_chat_id ?? null);
        setEnabled(!!(data as any).telegram_daily_workout);
      }
      setLoading(false);
    })();
  }, [user]);

  const isZh = lang === "zh";

  async function generateAndOpen() {
    if (!user) return;
    setBusy(true);
    try {
      const code = makeCode();
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("profiles")
        .update({
          telegram_link_code: code,
          telegram_link_code_expires_at: expires,
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      const url = `https://t.me/${BOT_USERNAME}?start=${code}`;
      window.open(url, "_blank");
      toast({
        title: isZh ? "請在 Telegram 完成連結" : "Finish linking in Telegram",
        description: isZh ? "在 Telegram 點擊「Start」即可。連結碼 15 分鐘內有效。" : "Tap 'Start' inside Telegram. The code is valid for 15 minutes.",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          telegram_chat_id: null,
          telegram_daily_workout: false,
          telegram_link_code: null,
          telegram_link_code_expires_at: null,
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      setLinkedChatId(null);
      setEnabled(false);
      toast({ title: isZh ? "已中斷連結" : "Disconnected" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (!user) return;
    const next = !enabled;
    setEnabled(next);
    const { error } = await supabase
      .from("profiles")
      .update({ telegram_daily_workout: next } as any)
      .eq("user_id", user.id);
    if (error) {
      setEnabled(!next);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  if (!user || loading) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Send size={20} className="text-primary" />
          <span className="font-medium text-foreground">
            {isZh ? "Telegram 每日訓練建議" : "Daily Telegram Workout"}
          </span>
        </div>
        {linkedChatId && (
          <button
            onClick={toggle}
            disabled={busy}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-input"}`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1 ml-8">
        {linkedChatId
          ? (isZh ? "每日早上 7 點（HKT）在 Telegram 收到 AI 跑步建議。" : "Get your AI workout suggestion in Telegram daily at 7am HKT.")
          : (isZh ? "把 RunWard 連到 Telegram，每天早上收到 AI 跑步建議。" : "Connect to Telegram and get an AI workout suggestion each morning.")}
      </p>
      <div className="mt-3 ml-8 flex gap-2">
        {linkedChatId ? (
          <button
            onClick={disconnect}
            disabled={busy}
            className="text-xs font-medium text-destructive hover:underline"
          >
            {isZh ? "中斷 Telegram 連結" : "Disconnect Telegram"}
          </button>
        ) : (
          <button
            onClick={generateAndOpen}
            disabled={busy}
            className="text-xs font-medium text-primary hover:underline"
          >
            {isZh ? "💬 連結 Telegram" : "💬 Connect Telegram"}
          </button>
        )}
      </div>
    </div>
  );
}
