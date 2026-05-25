import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Smartphone, Activity, Trophy, Users, Sparkles, Send, CheckCircle2, Loader2, Lightbulb } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface RoadmapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
}

const MILESTONES = [
  { icon: Smartphone, en: "Android Release", zh: "Android 版本發布", descEn: "Bringing Runward to Android devices", descZh: "將 Runward 帶到 Android 裝置" },
  { icon: Activity,   en: "Strava Connection", zh: "Strava 連接", descEn: "Sync activities directly from Strava", descZh: "直接從 Strava 同步活動" },
  { icon: Trophy,     en: "Achievement System", zh: "成就系統", descEn: "Unlock badges and milestones", descZh: "解鎖徽章與里程碑" },
  { icon: Users,      en: "Social System", zh: "社交系統", descEn: "Connect, follow, and run together", descZh: "互相連接、追蹤、一起跑步" },
];

const RoadmapDialog = ({ open, onOpenChange, lang }: RoadmapDialogProps) => {
  const { user } = useAuth();
  const [idea, setIdea] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) { setIdea(""); setSubmitted(false); }
  }, [open]);

  const handleSubmit = async () => {
    if (!user) {
      toast({ title: lang === "zh" ? "請先登入" : "Please sign in first", variant: "destructive" });
      return;
    }
    if (!idea.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("roadmap_ideas").insert({
      user_id: user.id,
      idea: idea.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast({ title: lang === "zh" ? "提交失敗" : "Failed to submit", description: error.message, variant: "destructive" });
      return;
    }
    setSubmitted(true);
    setIdea("");
    setTimeout(() => setSubmitted(false), 3500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            {lang === "zh" ? "產品路線圖" : "Product Roadmap"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "我們即將推出的功能" : "What's coming next for Runward"}
          </p>
        </DialogHeader>

        {/* Timeline */}
        <div className="relative pl-8 mt-2">
          {/* vertical line */}
          <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-primary via-primary/60 to-primary/10" />
          {MILESTONES.map((m, i) => {
            const Icon = m.icon;
            return (
              <div
                key={i}
                className="relative mb-5 animate-fade-in opacity-0"
                style={{ animationDelay: `${i * 120}ms`, animationFillMode: "forwards" }}
              >
                {/* dot + icon */}
                <span
                  className="absolute -left-[1.65rem] top-1 flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-[0_0_15px_hsl(var(--primary)/0.6)] ring-2 ring-background"
                >
                  <Icon size={14} className="text-primary-foreground" />
                </span>
                {/* card */}
                <div className="rounded-xl border border-border bg-card/60 backdrop-blur px-3 py-2.5 hover:border-primary/60 hover:translate-x-1 transition-all duration-300">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-primary/80 tracking-wider">
                      {lang === "zh" ? `第 ${i + 1} 步` : `STEP ${i + 1}`}
                    </span>
                    {i === 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold uppercase tracking-wider">
                        {lang === "zh" ? "進行中" : "Up Next"}
                      </span>
                    )}
                  </div>
                  <h4 className="font-display text-sm font-bold text-foreground leading-tight mt-0.5">
                    {lang === "zh" ? m.zh : m.en}
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {lang === "zh" ? m.descZh : m.descEn}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Idea submission */}
        <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-primary via-primary/40 to-primary/10 animate-fade-in" style={{ animationDelay: "600ms" }}>
          <div className="rounded-2xl bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-primary animate-pulse" />
              <h3 className="font-display text-sm font-bold text-foreground">
                {lang === "zh" ? "你的想法 ?" : "Got an idea?"}
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              {lang === "zh"
                ? "告訴我們你想在 Runward 看到什麼功能。"
                : "Tell us what you'd love to see in Runward next."}
            </p>
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={lang === "zh" ? "我希望可以..." : "I'd love it if..."}
              maxLength={500}
              rows={3}
              disabled={submitting || submitted}
              className="resize-none text-sm"
            />
            <div className="flex items-center justify-between mt-2 gap-2">
              <span className="text-[10px] text-muted-foreground">{idea.length}/500</span>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!idea.trim() || submitting || submitted}
                className="gap-1.5 transition-all"
              >
                {submitted ? (
                  <><CheckCircle2 className="h-3.5 w-3.5" /> {lang === "zh" ? "已送出！" : "Sent!"}</>
                ) : submitting ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {lang === "zh" ? "送出中..." : "Sending..."}</>
                ) : (
                  <><Send className="h-3.5 w-3.5" /> {lang === "zh" ? "送出" : "Submit"}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RoadmapDialog;
