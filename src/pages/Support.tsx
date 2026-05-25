import { Mail, ArrowLeft, LifeBuoy, Send, MessageSquare, CheckCircle2, Clock } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lang } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  admin_response: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

const Support = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [lang] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "en");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const fallbackRoute = ((location.state as { from?: string } | null)?.from) || "/";

  const handleReturn = () => {
    if ((window.history.state?.idx ?? 0) > 0) { navigate(-1); return; }
    navigate(fallbackRoute, { replace: true });
  };

  const loadTickets = async () => {
    if (!user) return;
    const { data, error } = await (supabase
      .from("support_feedback" as any)
      .select("id, title, description, status, admin_response, responded_at, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }) as any);
    if (!error && data) setTickets(data as Ticket[]);
  };

  useEffect(() => { loadTickets(); }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const needsName = !user;
    if ((needsName && !name.trim()) || !title.trim() || !description.trim()) {
      toast({ title: lang === "zh" ? "請填寫所有欄位" : "Please fill in all fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const payload: any = {
      title: title.trim(),
      description: description.trim(),
      name: user ? (name.trim() || "App User") : name.trim(),
    };
    if (user) payload.user_id = user.id;
    const { error } = await supabase.from("support_feedback" as any).insert(payload);
    setSubmitting(false);
    if (error) {
      toast({ title: lang === "zh" ? "提交失敗，請稍後再試" : "Failed to submit. Please try again.", variant: "destructive" });
    } else {
      toast({ title: lang === "zh" ? "✅ 已成功提交！" : "✅ Ticket submitted!" });
      setName(""); setTitle(""); setDescription("");
      loadTickets();
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "zh" ? "zh-HK" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-background px-5 pt-6 max-w-lg mx-auto pb-10">
      <button onClick={handleReturn} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <ArrowLeft size={16} />
        {lang === "zh" ? "返回" : "Back"}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <LifeBuoy size={24} className="text-primary" />
        <h1 className="font-display text-2xl font-bold text-foreground">
          {lang === "zh" ? "支援與幫助" : "Support"}
        </h1>
      </div>

      <div className="space-y-6">
        {/* My Tickets */}
        {user && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <MessageSquare size={16} className="text-primary" />
              {lang === "zh" ? "我的支援單" : "My Tickets"}
            </h2>
            {tickets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {lang === "zh" ? "你還沒有提交任何支援單。" : "You haven't submitted any tickets yet."}
              </p>
            ) : (
              <div className="space-y-2">
                {tickets.map((t) => {
                  const responded = !!t.admin_response;
                  const isOpen = openId === t.id;
                  return (
                    <div key={t.id} className="border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setOpenId(isOpen ? null : t.id)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50"
                      >
                        {responded ? (
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        ) : (
                          <Clock size={16} className="text-amber-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {fmtDate(t.created_at)} ·{" "}
                            {responded
                              ? (lang === "zh" ? "已回覆" : "Responded")
                              : (lang === "zh" ? "等待回覆中" : "Awaiting reply")}
                          </p>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 space-y-3 border-t border-border/60 bg-background/40">
                          <div className="pt-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                              {lang === "zh" ? "你的訊息" : "Your message"}
                            </p>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{t.description}</p>
                          </div>
                          {responded ? (
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-primary mb-1">
                                {lang === "zh" ? "管理員回覆" : "Admin response"}
                                {t.responded_at && (
                                  <span className="text-muted-foreground normal-case ml-2">· {fmtDate(t.responded_at)}</span>
                                )}
                              </p>
                              <p className="text-sm text-foreground whitespace-pre-wrap">{t.admin_response}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">
                              {lang === "zh" ? "我們會盡快回覆你。" : "We'll get back to you soon."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Submit a Ticket */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">
            {user
              ? (lang === "zh" ? "提交新支援單" : "Submit a New Ticket")
              : (lang === "zh" ? "意見回饋表" : "Feedback Form")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? "請描述你的問題或建議，我們會盡快回覆。"
              : "Describe your issue or suggestion and we'll reply as soon as possible."}
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            {!user && (
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">
                  {lang === "zh" ? "你的名字" : "Name"}
                </label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === "zh" ? "輸入你的名字" : "Enter your name"} maxLength={100} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                {lang === "zh" ? "標題" : "Title"}
              </label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={lang === "zh" ? "問題或建議的標題" : "Title of your question or suggestion"} maxLength={200} />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                {lang === "zh" ? "詳細描述" : "Description"}
              </label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={lang === "zh" ? "請詳細描述你的問題或建議..." : "Please describe your question or feedback in detail..."} maxLength={2000} rows={4} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              <Send size={14} className="mr-1.5" />
              {submitting ? (lang === "zh" ? "提交中..." : "Submitting...") : (lang === "zh" ? "提交" : "Submit")}
            </Button>
          </form>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">
            {lang === "zh" ? "聯繫方式" : "Contact Us"}
          </h2>
          <a
            href="mailto:runwardsupport@gmail.com"
            className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-3 text-sm font-medium w-full justify-center"
          >
            <Mail size={16} />
            runwardsupport@gmail.com
          </a>
          <p className="text-xs text-muted-foreground text-center">
            {lang === "zh"
              ? "我們通常會在 1-2 個工作天內回覆。"
              : "We typically respond within 1–2 business days."}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Support;
