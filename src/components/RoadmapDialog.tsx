import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone,
  Activity,
  Trophy,
  Users,
  Sparkles,
  Send,
  CheckCircle2,
  Loader2,
  Lightbulb,
  ArrowRight,
  Zap,
  Route,
} from "lucide-react";
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
  {
    icon: Smartphone,
    en: "Android Version",
    zh: "Android 版本",
    descEn: "Native Android app with full feature parity",
    descZh: "功能完整的原生 Android App",
    accent: "from-emerald-400/20 to-emerald-500/5",
    glow: "shadow-[0_0_20px_rgba(52,211,153,0.3)]",
    border: "hover:border-emerald-400/40",
    text: "text-emerald-400",
    iconBg: "from-emerald-400 to-emerald-500",
  },
  {
    icon: Activity,
    en: "Strava Connection",
    zh: "Strava 連接",
    descEn: "Auto-sync runs & rides from Strava",
    descZh: "自動從 Strava 同步跑步及騎行",
    accent: "from-orange-400/20 to-orange-500/5",
    glow: "shadow-[0_0_20px_rgba(251,146,60,0.3)]",
    border: "hover:border-orange-400/40",
    text: "text-orange-400",
    iconBg: "from-orange-400 to-orange-500",
  },
  {
    icon: Trophy,
    en: "Achievement System",
    zh: "成就系統",
    descEn: "Unlock badges, streaks & milestones",
    descZh: "解鎖徽章、連續紀錄與里程碑",
    accent: "from-amber-400/20 to-amber-500/5",
    glow: "shadow-[0_0_20px_rgba(251,191,36,0.3)]",
    border: "hover:border-amber-400/40",
    text: "text-amber-400",
    iconBg: "from-amber-400 to-amber-500",
  },
  {
    icon: Users,
    en: "Social System",
    zh: "社交系統",
    descEn: "Follow friends, groups & challenges",
    descZh: "關注朋友、群組及挑戰活動",
    accent: "from-sky-400/20 to-sky-500/5",
    glow: "shadow-[0_0_20px_rgba(56,189,248,0.3)]",
    border: "hover:border-sky-400/40",
    text: "text-sky-400",
    iconBg: "from-sky-400 to-sky-500",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const lineVariants = {
  hidden: { scaleY: 0, originY: 0 },
  visible: {
    scaleY: 1,
    transition: { duration: 0.8, ease: "easeOut" as const, delay: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20, scale: 0.95 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

const RoadmapDialog = ({ open, onOpenChange, lang }: RoadmapDialogProps) => {
  const { user } = useAuth();
  const [idea, setIdea] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setIdea("");
      setSubmitted(false);
      setHoveredIndex(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!user) {
      toast({
        title: lang === "zh" ? "請先登入" : "Please sign in first",
        variant: "destructive",
      });
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
      toast({
        title: lang === "zh" ? "提交失敗" : "Failed to submit",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setSubmitted(true);
    setIdea("");
    setTimeout(() => setSubmitted(false), 3500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto border-border/60 bg-gradient-to-b from-card to-card/95 backdrop-blur-xl">
        <DialogHeader>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <DialogTitle className="flex items-center gap-2.5 text-xl font-display">
              <span className="relative">
                <Sparkles className="h-5 w-5 text-primary" />
                <motion.span
                  className="absolute inset-0 rounded-full bg-primary/20"
                  animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              </span>
              {lang === "zh" ? "即將推出" : "Coming Soon"}
            </DialogTitle>
          </motion.div>
          <motion.p
            className="text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            {lang === "zh" ? "我們正在全力開發的新功能" : "Features we're building for Runward"}
          </motion.p>
        </DialogHeader>

        {/* Timeline */}
        <motion.div
          className="relative pl-10 mt-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Animated vertical line */}
          <motion.div
            className="absolute left-[1.1rem] top-3 bottom-4 w-0.5 bg-gradient-to-b from-emerald-400/60 via-orange-400/40 to-sky-400/20 rounded-full"
            variants={lineVariants}
          />

          {MILESTONES.map((m, i) => {
            const Icon = m.icon;
            const isHovered = hoveredIndex === i;
            const isFirst = i === 0;

            return (
              <motion.div
                key={i}
                className="relative mb-4"
                variants={itemVariants}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Animated dot + icon */}
                <motion.span
                  className={`absolute -left-[2.6rem] top-0 flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br ${m.iconBg} shadow-lg ring-2 ring-background`}
                  animate={{
                    scale: isHovered ? 1.15 : 1,
                    boxShadow: isHovered
                      ? "0 0 25px rgba(255,255,255,0.3)"
                      : "0 4px 12px rgba(0,0,0,0.2)",
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  <Icon size={15} className="text-white" />
                  {isFirst && (
                    <motion.span
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary"
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}
                </motion.span>

                {/* Card */}
                <motion.div
                  className={`relative rounded-xl border border-border/60 bg-gradient-to-br ${m.accent} backdrop-blur-sm px-4 py-3 cursor-default overflow-hidden ${m.border} transition-colors`}
                  animate={{
                    x: isHovered ? 6 : 0,
                    borderColor: isHovered ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  {/* Subtle shimmer on hover */}
                  <AnimatePresence>
                    {isHovered && (
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6, ease: "easeInOut" }}
                      />
                    )}
                  </AnimatePresence>

                  <div className="relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold tracking-widest uppercase ${m.text}`}>
                          {lang === "zh" ? `第 ${i + 1} 項` : `Feature ${i + 1}`}
                        </span>
                        {isFirst && (
                          <motion.span
                            className="text-[9px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold uppercase tracking-wider flex items-center gap-1"
                            animate={{ opacity: [0.7, 1, 0.7] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <Zap size={10} />
                            {lang === "zh" ? "進行中" : "In Progress"}
                          </motion.span>
                        )}
                      </div>
                      <motion.div
                        animate={{ x: isHovered ? 0 : -4, opacity: isHovered ? 1 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ArrowRight size={14} className={m.text} />
                      </motion.div>
                    </div>

                    <h4 className="font-display text-sm font-bold text-foreground leading-tight mt-1">
                      {lang === "zh" ? m.zh : m.en}
                    </h4>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                      {lang === "zh" ? m.descZh : m.descEn}
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Idea submission */}
        <motion.div
          className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-primary/50 via-primary/20 to-transparent mt-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5, type: "spring", stiffness: 200, damping: 20 }}
        >
          <div className="rounded-2xl bg-card/80 backdrop-blur-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <Lightbulb className="h-4 w-4 text-primary" />
              </motion.div>
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
              className="resize-none text-sm bg-background/50 border-border/60 focus:border-primary/40 focus:ring-primary/10"
            />
            <div className="flex items-center justify-between mt-2.5 gap-2">
              <span className="text-[10px] text-muted-foreground">{idea.length}/500</span>
              <motion.div whileTap={{ scale: 0.95 }}>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!idea.trim() || submitting || submitted}
                  className="gap-1.5 transition-all"
                >
                  <AnimatePresence mode="wait">
                    {submitted ? (
                      <motion.span
                        key="submitted"
                        className="flex items-center gap-1.5"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {lang === "zh" ? "已送出！" : "Sent!"}
                      </motion.span>
                    ) : submitting ? (
                      <motion.span
                        key="submitting"
                        className="flex items-center gap-1.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {lang === "zh" ? "送出中..." : "Sending..."}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        className="flex items-center gap-1.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {lang === "zh" ? "送出" : "Submit"}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default RoadmapDialog;
