import { Mail, ArrowLeft, LifeBuoy, Send } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lang } from "@/lib/i18n";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Support = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [lang] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "en");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fallbackRoute = ((location.state as { from?: string } | null)?.from) || "/";

  const handleReturn = () => {
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }

    navigate(fallbackRoute, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !title.trim() || !description.trim()) {
      toast({ title: lang === "zh" ? "請填寫所有欄位" : "Please fill in all fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("support_feedback" as any).insert({
      name: name.trim(),
      title: title.trim(),
      description: description.trim(),
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: lang === "zh" ? "提交失敗，請稍後再試" : "Failed to submit. Please try again.", variant: "destructive" });
    } else {
      toast({ title: lang === "zh" ? "✅ 已成功提交！" : "✅ Feedback submitted successfully!" });
      setName("");
      setTitle("");
      setDescription("");
    }
  };

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
        <p className="text-sm text-muted-foreground leading-relaxed">
          {lang === "zh"
            ? "如果你在使用 向前跑(RunWard) 時遇到任何問題，或有任何建議和意見，歡迎隨時聯繫我們。我們會盡快回覆你！"
            : "If you encounter any issues while using RunWard, or have any suggestions and feedback, feel free to reach out to us. We'll get back to you as soon as possible!"}
        </p>

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

        {/* Feedback Form */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">
            {lang === "zh" ? "意見回饋表" : "Feedback Form"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? "或者你也可以在下方填寫你的問題或建議。"
              : "Or you can choose to fill in your questions below."}
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                {lang === "zh" ? "你的名字" : "Name"}
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === "zh" ? "輸入你的名字" : "Enter your name"} maxLength={100} />
            </div>
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

        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">
            {lang === "zh" ? "常見問題" : "FAQ"}
          </h2>
          <div className="space-y-3">
            {[
              {
                q: lang === "zh" ? "如何升級到高級版？" : "How do I upgrade to Premium?",
                a: lang === "zh" ? "前往「更多」頁面，點擊「升級高級版」按鈕即可。" : "Go to the 'More' tab and tap the 'Upgrade' button in the Premium section.",
              },
              {
                q: lang === "zh" ? "姿勢分析支援哪些影片格式？" : "What video formats does posture analysis support?",
                a: lang === "zh" ? "支援大部分常見格式，包括 MP4、MOV 等。建議上傳 5-15 秒的側面跑步影片。" : "Most common formats are supported including MP4, MOV, etc. We recommend a 5–15 second side-view running clip.",
              },
              {
                q: lang === "zh" ? "訓練計畫可以修改嗎？" : "Can I edit my training plan?",
                a: lang === "zh" ? "可以！點擊「編輯計畫」按鈕即可修改每日訓練內容。" : "Yes! Tap the 'Edit Plan' button to modify your daily workouts.",
              },
            ].map((item, i) => (
              <div key={i} className="bg-accent rounded-lg p-3">
                <h3 className="text-sm font-medium text-foreground mb-1">{item.q}</h3>
                <p className="text-xs text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;
