import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import despia from "despia-native";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { isDespiaUA } from "@/lib/despiaOAuth";
import { Lang } from "@/lib/i18n";
import MessagingIntroSheet from "@/components/MessagingIntroSheet";

function makeCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchBusinessNumber(): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke("get-whatsapp-number");
    if (error) return "";
    return (data?.number as string | undefined)?.replace(/[^\d]/g, "") || "";
  } catch {
    return "";
  }
}

export default function WhatsAppConnectCard({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkedWaId, setLinkedWaId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("whatsapp_wa_id, whatsapp_daily_workout, whatsapp_activity_feedback")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setLinkedWaId((data as any).whatsapp_wa_id ?? null);
        setEnabled(!!(data as any).whatsapp_daily_workout);
        setFeedbackEnabled(!!(data as any).whatsapp_activity_feedback);
      }
      setLoading(false);
    })();
  }, [user]);

  const isZh = lang === "zh";

  async function generateAndOpen() {
    if (!user) return;
    const businessNumber = await fetchBusinessNumber();
    if (!businessNumber) {
      toast({
        title: "Not configured",
        description: "WHATSAPP_BUSINESS_NUMBER backend secret is not set.",
        variant: "destructive",
      });
      return;
    }
    const native = isDespiaUA();
    const popup = native ? null : window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const code = makeCode();
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("profiles")
        .update({
          whatsapp_link_code: code,
          whatsapp_link_code_expires_at: expires,
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      const message = encodeURIComponent(`LINK ${code}`);
      const url = `https://wa.me/${businessNumber}?text=${message}`;
      if (native) {
        despia(`oauth://?url=${encodeURIComponent(url)}`);
      } else if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        window.location.href = url;
      }
      toast({
        title: isZh ? "請在 WhatsApp 完成連結" : "Finish linking in WhatsApp",
        description: isZh ? "在 WhatsApp 點擊「傳送」即可。連結碼 15 分鐘內有效。" : "Tap 'Send' inside WhatsApp. The code is valid for 15 minutes.",
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
          whatsapp_wa_id: null,
          whatsapp_phone_e164: null,
          whatsapp_daily_workout: false,
          whatsapp_activity_feedback: false,
          whatsapp_link_code: null,
          whatsapp_link_code_expires_at: null,
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      setLinkedWaId(null);
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
      .update({ whatsapp_daily_workout: next } as any)
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
      .update({ whatsapp_activity_feedback: next } as any)
      .eq("user_id", user.id);
    if (error) {
      setFeedbackEnabled(!next);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  if (!user || loading) return null;

  const Switch = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={busy}
      className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? "bg-primary" : "bg-input"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-3">
        <MessageCircle size={20} className="text-primary" />
        <span className="font-medium text-foreground">
          {isZh ? "WhatsApp 通知" : "WhatsApp"}
        </span>
      </div>

      {linkedWaId ? (
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
                {isZh ? "完成跑步後在 WhatsApp 詢問你的 RPE 和感受，並提供 AI 教練回饋。" : "After each run, I'll ask for your RPE and how you felt, then reply with AI coach feedback."}
              </p>
            </div>
            <Switch on={feedbackEnabled} onClick={toggleFeedback} />
          </div>

          <button
            onClick={disconnect}
            disabled={busy}
            className="text-xs font-medium text-destructive hover:underline"
          >
            {isZh ? "中斷 WhatsApp 連結" : "Disconnect WhatsApp"}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {isZh
              ? "把 RunWard 連到 WhatsApp，每天早上收到 AI 跑步建議，並在跑步後分享感受獲得回饋。點擊下方按鈕後在 WhatsApp 內按「傳送」即可完成連結。"
              : "Connect to WhatsApp for daily AI workout suggestions and post-run feedback. Tap below, then press 'Send' in WhatsApp to finish linking."}
          </p>
          <button
            onClick={generateAndOpen}
            disabled={busy}
            className="text-sm font-medium text-primary hover:underline"
          >
            {isZh ? "💬 連結 WhatsApp" : "💬 Connect WhatsApp"}
          </button>
        </>
      )}
    </div>
  );
}
