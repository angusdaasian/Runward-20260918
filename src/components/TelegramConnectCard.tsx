import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import despia from "despia-native";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { isDespiaUA } from "@/lib/despiaOAuth";
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
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("telegram_chat_id, telegram_daily_workout, telegram_activity_feedback")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setLinkedChatId((data as any).telegram_chat_id ?? null);
        setEnabled(!!(data as any).telegram_daily_workout);
        setFeedbackEnabled(!!(data as any).telegram_activity_feedback);
      }
      setLoading(false);
    })();
  }, [user]);

  const isZh = lang === "zh";

  async function generateAndOpen() {
    if (!user) return;
    const native = isDespiaUA();
    // On web, open a blank tab SYNCHRONOUSLY so the popup blocker treats it
    // as a direct user gesture. We set the real URL after the DB update.
    const popup = native ? null : window.open("about:blank", "_blank");
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
      if (native) {
        // Despia native bridge: open in an external browser session instead
        // of trying to spawn a popup inside the webview.
        despia(`oauth://?url=${encodeURIComponent(url)}`);
      } else if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        window.location.href = url;
      }
      toast({
        title: isZh ? "請在 Telegram 完成連結" : "Finish linking in Telegram",
        description: isZh ? "在 Telegram 點擊「Start」即可。連結碼 15 分鐘內有效。" : "Tap 'Start' inside Telegram. The code is valid for 15 minutes.",
      });
    } catch (e: any) {
      if (popup && !popup.closed) popup.close();
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
          telegram_activity_feedback: false,
          telegram_link_code: null,
          telegram_link_code_expires_at: null,
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      setLinkedChatId(null);
      setEnabled(false);
      setFeedbackEnabled(false);
      toast({ title: isZh ? "已中斷連結" : "Disconnected" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleDaily() {
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

  async function toggleFeedback() {
    if (!user) return;
    const next = !feedbackEnabled;
    setFeedbackEnabled(next);
    const { error } = await supabase
      .from("profiles")
      .update({ telegram_activity_feedback: next } as any)
      .eq("user_id", user.id);
    if (error) {
      setFeedbackEnabled(!next);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  if (!user || loading) return null;

  const Switch = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      disabled={busy}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? "bg-primary" : "bg-input"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Send size={20} className="text-primary" />
        <span className="font-medium text-foreground">
          {isZh ? "Telegram 通知" : "Telegram"}
        </span>
      </div>

      {linkedChatId ? (
        <>
          <div className="flex items-center justify-between">
            <div className="pr-3">
              <div className="text-sm text-foreground">
                {isZh ? "每日跑步建議" : "Daily workout suggestion"}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isZh ? "每天早上 7 點（HKT）收到 AI 跑步建議。" : "Get an AI workout suggestion every morning at 7am HKT."}
              </p>
            </div>
            <Switch on={enabled} onClick={toggleDaily} />
          </div>

          <div className="flex items-center justify-between">
            <div className="pr-3">
              <div className="text-sm text-foreground">
                {isZh ? "跑步後回饋" : "Post-run feedback"}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isZh ? "完成跑步後在 Telegram 詢問你的 RPE 和感受，並提供 AI 教練回饋。" : "After each run, I'll ask for your RPE and how you felt, then reply with AI coach feedback."}
              </p>
            </div>
            <Switch on={feedbackEnabled} onClick={toggleFeedback} />
          </div>

          <button
            onClick={disconnect}
            disabled={busy}
            className="text-xs font-medium text-destructive hover:underline"
          >
            {isZh ? "中斷 Telegram 連結" : "Disconnect Telegram"}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {isZh
              ? "把 RunWard 連到 Telegram，每天早上收到 AI 跑步建議，並在跑步後分享感受獲得回饋。"
              : "Connect to Telegram for daily AI workout suggestions and post-run feedback chats."}
          </p>
          <button
            onClick={generateAndOpen}
            disabled={busy}
            className="text-sm font-medium text-primary hover:underline"
          >
            {isZh ? "💬 連結 Telegram" : "💬 Connect Telegram"}
          </button>
        </>
      )}
    </div>
  );
}
