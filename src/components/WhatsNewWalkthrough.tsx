import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Menu, ArrowRight, ChevronRight, Settings2, Hand,
  Activity, BarChart3, Heart, Moon, Type, Link2, MessageSquare, Send,
  Brain, LineChart, Database,
} from "lucide-react";
import { Lang } from "@/lib/i18n";

const STORAGE_KEY = "walkthrough_v2026_06_ai_intervals_seen";


interface Props {
  lang: Lang;
  /** Walkthrough only auto-triggers when this is true (e.g. on the activities tab, signed-in). */
  enabled: boolean;
  /** Manual control (e.g. from a menu). When true, opens the walkthrough without writing the "seen" flag. */
  manualOpen?: boolean;
  onManualOpenChange?: (open: boolean) => void;
}

const tx = (lang: Lang, en: string, zh: string) => (lang === "zh" ? zh : en);

/* -------------------- Illustrations -------------------- */

const SimpleModeIllustration = ({ lang }: { lang: Lang }) => (
  <div className="relative w-full rounded-xl bg-muted/40 border border-border p-3 overflow-hidden">
    {/* Mock header */}
    <div className="flex items-center justify-between gap-2 rounded-lg bg-card border border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/20" />
        <div className="flex flex-col gap-1">
          <div className="h-2 w-16 rounded bg-foreground/40" />
          <div className="h-1.5 w-10 rounded bg-foreground/20" />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-7 h-7 rounded-full bg-primary/15" />
        <div className="w-7 h-7 rounded-full bg-pink-500/15" />
        <div className="relative">
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center ring-4 ring-primary/30 animate-pulse">
            <Menu size={14} />
          </div>
        </div>
      </div>
    </div>

    <div className="flex items-center justify-end gap-1 mt-1 pr-1">
      <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
        {tx(lang, "Tap menu", "點選選單")}
      </span>
      <ArrowRight size={12} className="text-primary" />
    </div>

    <div className="ml-auto mt-2 w-[80%] rounded-2xl bg-muted/70 border-2 border-primary/40 shadow-lg p-2">
      <div className="flex items-center gap-2 p-1.5 rounded-md bg-primary/10">
        <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <Sparkles size={14} />
        </span>
        <div className="flex flex-col flex-1">
          <span className="text-[11px] font-semibold text-foreground">
            {tx(lang, "Simple Mode", "簡易模式")}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {tx(lang, "Hide advanced tabs", "隱藏進階分頁")}
          </span>
        </div>
        <span className="inline-flex items-center w-7 h-4 rounded-full bg-primary">
          <span className="block w-3 h-3 rounded-full bg-background shadow translate-x-[14px]" />
        </span>
      </div>
      <div className="flex items-center gap-2 p-1.5 mt-1 opacity-50">
        <span className="w-8 h-8 rounded-full bg-muted" />
        <div className="h-2 w-20 rounded bg-foreground/20" />
      </div>
    </div>
  </div>
);

const WidgetsIllustration = ({ lang }: { lang: Lang }) => (
  <div className="relative w-full rounded-xl bg-muted/40 border border-border p-3 overflow-hidden">
    <div className="flex items-center justify-between mb-2">
      <div className="h-2.5 w-20 rounded bg-foreground/40" />
      <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5 ring-2 ring-primary/30">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-muted-foreground">
          {tx(lang, "Classic", "傳統")}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[9px] font-semibold">
          {tx(lang, "Widgets", "小工具")}
        </span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      {[
        { icon: Activity, label: tx(lang, "VO₂max", "VO₂max"), value: "48" },
        { icon: Heart, label: tx(lang, "RHR", "靜息心率"), value: "52" },
        { icon: Moon, label: tx(lang, "Sleep", "睡眠"), value: "7h 12m" },
        { icon: BarChart3, label: tx(lang, "Race Pred.", "賽事預測"), value: "—" },
      ].map(({ icon: Icon, label, value }, i) => (
        <div
          key={i}
          className={`relative rounded-lg bg-card border ${i === 3 ? "border-primary ring-2 ring-primary/30" : "border-border"} p-2`}
        >
          <div className="flex items-center justify-between">
            <Icon size={12} className="text-primary" />
            {i === 3 && <ChevronRight size={11} className="text-primary" />}
          </div>
          <div className="mt-1 h-1.5 w-12 rounded bg-foreground/20" />
          <div className="mt-1 text-[11px] font-bold text-foreground">{value}</div>
        </div>
      ))}
    </div>

    <div className="mt-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <ChevronRight size={12} className="text-primary shrink-0" />
        <span className="text-[10px] text-foreground/80">
          {tx(lang, "Tap a widget to open details", "點選小工具查看詳情")}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Hand size={12} className="text-primary shrink-0" />
        <span className="text-[10px] text-foreground/80">
          {tx(lang, "Long-press to drag & reorder", "長按可拖曳排序")}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Settings2 size={12} className="text-primary shrink-0" />
        <span className="text-[10px] text-foreground/80">
          {tx(lang, "Toggle between Classic and Widgets view", "在「傳統」與「小工具」版面間切換")}
        </span>
      </div>
    </div>
  </div>
);

const TextSizeIllustration = ({ lang }: { lang: Lang }) => (
  <div className="relative w-full rounded-xl bg-card border border-border p-4 overflow-hidden">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="font-display font-semibold text-primary text-base leading-none w-4 text-center">A</span>
        <span className="text-[12px] font-medium text-foreground">
          {tx(lang, "Text Size", "文字大小")}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground">
        {tx(lang, "Large", "大")}
      </span>
    </div>

    <div className="flex gap-2">
      {[
        { label: "A", sub: tx(lang, "Default", "預設"), size: "text-sm", active: false },
        { label: "A", sub: tx(lang, "Large", "大"), size: "text-base", active: true },
        { label: "A", sub: tx(lang, "X-Large", "特大"), size: "text-lg", active: false },
      ].map((opt, i) => (
        <div
          key={i}
          className={`flex-1 py-2.5 rounded-lg flex flex-col items-center justify-center gap-1 ${
            opt.active ? "bg-primary text-primary-foreground" : "bg-accent text-foreground"
          }`}
        >
          <span className={`font-display font-semibold leading-none ${opt.size}`}>{opt.label}</span>
          <span className="text-[10px] opacity-80 leading-none">{opt.sub}</span>
        </div>
      ))}
    </div>

    <div className="mt-3 flex items-start gap-1.5">
      <Settings2 size={11} className="text-primary shrink-0 mt-0.5" />
      <span className="text-[10px] text-foreground/80">
        {tx(
          lang,
          "Find it under Settings → Display preferences",
          "前往「設定 → 顯示偏好」調整"
        )}
      </span>
    </div>
  </div>
);

const StravaIllustration = ({ lang }: { lang: Lang }) => (
  <div className="relative w-full rounded-xl bg-muted/40 border border-border p-4 overflow-hidden">
    <div className="rounded-lg bg-card border-2 border-primary p-3 shadow">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[hsl(16,100%,50%)] flex items-center justify-center text-white font-bold text-sm shadow">
          S
        </div>
        <div className="flex-1">
          <div className="text-[12px] font-semibold text-foreground">Strava</div>
          <div className="text-[10px] text-muted-foreground">
            {tx(lang, "Auto-sync your runs", "自動同步你的跑步")}
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold">
          <Link2 size={10} />
          {tx(lang, "Connect", "連結")}
        </div>
      </div>
    </div>

    <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
      <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-0.5">
        {tx(lang, "Limited spots", "名額有限")}
      </div>
      <div className="text-[10px] text-foreground/80 leading-relaxed">
        {tx(
          lang,
          "Strava currently limits us to ~10 connected athletes while our app awaits approval. Connect early to secure a slot.",
          "Strava 在我們的應用程式審核期間，目前只允許約 10 位用戶連結。請盡早連結以保留名額。"
        )}
      </div>
    </div>

    <div className="mt-2 flex items-center gap-1.5">
      <ChevronRight size={12} className="text-primary shrink-0" />
      <span className="text-[10px] text-foreground/80">
        {tx(lang, "Go to Connect Apps to link Strava", "前往「連結應用程式」連接 Strava")}
      </span>
    </div>
  </div>
);

const MessagingIllustration = ({ lang }: { lang: Lang }) => (
  <div className="relative w-full rounded-xl bg-muted/40 border border-border p-3 overflow-hidden">
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-lg bg-card border-2 border-primary p-2.5 shadow">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center text-white">
            <MessageSquare size={14} />
          </div>
          <div className="text-[11px] font-semibold text-foreground">WhatsApp</div>
        </div>
        <div className="mt-2 rounded-md bg-muted/60 p-1.5 text-[9px] text-foreground/80 leading-snug">
          {tx(lang, "Daily AI workout & chat", "每日 AI 訓練與聊天")}
        </div>
      </div>
      <div className="rounded-lg bg-card border-2 border-primary p-2.5 shadow">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#229ED9] flex items-center justify-center text-white">
            <Send size={14} />
          </div>
          <div className="text-[11px] font-semibold text-foreground">Telegram</div>
        </div>
        <div className="mt-2 rounded-md bg-muted/60 p-1.5 text-[9px] text-foreground/80 leading-snug">
          {tx(lang, "Chat with your AI coach", "與 AI 教練對話")}
        </div>
      </div>
    </div>
    <div className="mt-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <ChevronRight size={12} className="text-primary shrink-0" />
        <span className="text-[10px] text-foreground/80">
          {tx(lang, "Get a morning workout suggestion", "每天早上收到訓練建議")}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <ChevronRight size={12} className="text-primary shrink-0" />
        <span className="text-[10px] text-foreground/80">
          {tx(lang, "Share post-run feelings, get coach feedback", "跑步後分享感受，獲得教練回饋")}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Settings2 size={12} className="text-primary shrink-0" />
        <span className="text-[10px] text-foreground/80">
          {tx(lang, "Open from More → Messaging Apps", "從「更多 → 通訊應用程式」開啟")}
        </span>
      </div>
    </div>
  </div>
);

const AiModelIllustration = ({ lang }: { lang: Lang }) => (
  <div className="relative w-full rounded-xl bg-muted/40 border border-border p-3 overflow-hidden">
    <div className="flex items-center gap-2 rounded-lg bg-card border-2 border-primary p-2.5 shadow">
      <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary">
        <Brain size={18} />
      </div>
      <div className="flex-1">
        <div className="text-[11px] font-semibold text-foreground">
          {tx(lang, "Smarter AI Coach", "更聰明的 AI 教練")}
        </div>
        <div className="text-[9px] text-muted-foreground">
          {tx(lang, "Trained on your full 2026 history", "已學習你 2026 年的全部紀錄")}
        </div>
      </div>
    </div>
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {[
        { icon: Database, label: tx(lang, "All runs", "所有跑步") },
        { icon: LineChart, label: tx(lang, "Trends", "趨勢") },
        { icon: Sparkles, label: tx(lang, "Insights", "洞察") },
      ].map(({ icon: Icon, label }, i) => (
        <div key={i} className="rounded-md bg-card border border-border p-1.5 flex flex-col items-center gap-1">
          <Icon size={12} className="text-primary" />
          <span className="text-[9px] font-semibold text-foreground/80">{label}</span>
        </div>
      ))}
    </div>
    <div className="mt-2 flex items-center gap-1.5">
      <ChevronRight size={12} className="text-primary shrink-0" />
      <span className="text-[10px] text-foreground/80">
        {tx(lang, "More accurate analysis & suggestions", "更準確的分析與建議")}
      </span>
    </div>
  </div>
);

const IntervalsIllustration = ({ lang }: { lang: Lang }) => (
  <div className="relative w-full rounded-xl bg-muted/40 border border-border p-3 overflow-hidden">
    <div className="flex items-center gap-2 rounded-lg bg-card border-2 border-primary p-2.5 shadow">
      <div className="w-10 h-10 rounded-md bg-[#FF6B35] flex items-center justify-center text-white font-bold text-[11px]">
        i.icu
      </div>
      <div className="flex-1">
        <div className="text-[11px] font-semibold text-foreground">
          {tx(lang, "Intervals.icu", "Intervals.icu")}
        </div>
        <div className="text-[9px] text-muted-foreground">
          {tx(lang, "Sync workouts & fitness data", "同步訓練與體能數據")}
        </div>
      </div>
      <Link2 size={14} className="text-primary" />
    </div>
    <div className="mt-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <ChevronRight size={12} className="text-primary shrink-0" />
        <span className="text-[10px] text-foreground/80">
          {tx(lang, "Pull activities from intervals.icu", "從 intervals.icu 匯入活動")}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Settings2 size={12} className="text-primary shrink-0" />
        <span className="text-[10px] text-foreground/80">
          {tx(lang, "Connect from More → Connect Apps", "從「更多 → 連結應用程式」連接")}
        </span>
      </div>
    </div>
  </div>
);

/* -------------------- Component -------------------- */




const WhatsNewWalkthrough = ({ lang, enabled, manualOpen, onManualOpenChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const axisLock = useRef<null | "x" | "y">(null);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") return;
    } catch { /* storage may be unavailable */ }
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [enabled]);

  useEffect(() => {
    if (manualOpen) {
      setStep(0);
      setOpen(true);
    }
  }, [manualOpen]);

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch { /* ignore */ }
    setOpen(false);
    onManualOpenChange?.(false);
  };


  const steps = [
    {
      title: tx(lang, "Connect WhatsApp & Telegram", "連接 WhatsApp 與 Telegram"),
      desc: tx(
        lang,
        "Bring RunWard into your favourite chat app. Get a daily AI workout suggestion each morning, share how a run felt to get instant coach feedback, or chat with your AI coach anytime — all inside WhatsApp or Telegram. Open it from More → Messaging Apps.",
        "把 RunWard 帶進你常用的聊天工具。每天早上收到 AI 訓練建議、跑完即時分享感受獲得教練回饋，或隨時與 AI 教練對話 — 全部在 WhatsApp 或 Telegram 內完成。從「更多 → 通訊應用程式」開啟。"
      ),
      illustration: <MessagingIllustration lang={lang} />,
    },
    {
      title: tx(lang, "Improved AI model for better analysis", "升級 AI 模型，分析更精準"),
      desc: tx(
        lang,
        "Our AI model now learns from your full 2026 training history every time you chat — every run, every PR, every trend. That means more accurate insights, smarter workout suggestions, and feedback that actually remembers what you did last week (and last month).",
        "我們的 AI 模型現在每次對話都會學習你 2026 年的完整訓練紀錄 — 每一次跑步、每一個 PR、每一個趨勢。代表更準確的洞察、更聰明的訓練建議，以及真正記得你上週（甚至上個月）做過什麼的回饋。"
      ),
      illustration: <AiModelIllustration lang={lang} />,
    },
    {
      title: tx(lang, "Added Intervals.icu connection", "新增 Intervals.icu 連接"),
      desc: tx(
        lang,
        "You can now connect your Intervals.icu account to sync workouts and fitness data straight into RunWard. Open More → Connect Apps to link it up.",
        "現在可以連接你的 Intervals.icu 帳戶，將訓練與體能數據直接同步到 RunWard。從「更多 → 連結應用程式」開啟連接。"
      ),
      illustration: <IntervalsIllustration lang={lang} />,
    },
    {
      title: tx(lang, "Meet Simple Mode", "認識簡易模式"),
      desc: tx(
        lang,
        "Built for runners who just want to run — without being overwhelmed by data. Simple Mode hides advanced tabs (like Analytics) and gives you cleaner, more concise workout suggestions. Toggle it anytime from the menu in the top-right.",
        "為只想專心跑步、不想被太多數據淹沒的跑者而設。簡易模式會隱藏進階分頁（例如數據分析），並提供更精簡的訓練建議。隨時可從右上角選單切換。"
      ),
      illustration: <SimpleModeIllustration lang={lang} />,
    },

    {
      title: tx(lang, "New Widget Analytics", "全新小工具數據分析"),
      desc: tx(
        lang,
        "Your Analytics tab now has a personalised Widgets view. Tap to open, long-press to rearrange, and use the Classic / Widgets toggle at the top to switch between the new widget board and the classic view.",
        "「數據分析」分頁新增了個人化「小工具」版面。點選查看、長按可拖曳排序，並可透過頂部的「傳統 / 小工具」切換在新版小工具與傳統版面之間切換。"
      ),
      illustration: <WidgetsIllustration lang={lang} />,
    },
    {
      title: tx(lang, "Adjustable text size", "可調整文字大小"),
      desc: tx(
        lang,
        "Prefer bigger (or smaller) text? You can now scale the whole app's typography to your comfort from Settings → Display preferences.",
        "想要更大（或更小）的字？現在可在「設定 → 顯示偏好」調整整個應用程式的文字大小，看得更舒適。"
      ),
      illustration: <TextSizeIllustration lang={lang} />,
    },
    {
      title: tx(lang, "Connect Strava", "連結 Strava"),
      desc: tx(
        lang,
        "Sync runs automatically by linking your Strava account. Heads up: Strava currently limits us to about 10 connected athletes while our app awaits full approval — connect early to grab a spot.",
        "連結 Strava 帳號即可自動同步跑步紀錄。注意：在 Strava 完成審核前，目前只開放約 10 位用戶連結，請盡早連結以保留名額。"
      ),
      illustration: <StravaIllustration lang={lang} />,
    },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  const SWIPE_THRESHOLD = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
    axisLock.current = null;
    setIsDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    if (axisLock.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axisLock.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
    }
    if (axisLock.current === "x") {
      // Resist at edges
      let adj = dx;
      if ((step === 0 && dx > 0) || (isLast && dx < 0)) adj = dx / 3;
      setDragX(adj);
    }
  };

  const onTouchEnd = () => {
    if (axisLock.current === "x") {
      if (dragX <= -SWIPE_THRESHOLD && !isLast) {
        setStep((s) => s + 1);
      } else if (dragX >= SWIPE_THRESHOLD && step > 0) {
        setStep((s) => s - 1);
      }
    }
    setDragX(0);
    setIsDragging(false);
    axisLock.current = null;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl bg-muted/80 backdrop-blur-sm border-border">
        <div
          className="p-5 touch-pan-y select-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex items-center gap-2 text-primary text-[11px] font-semibold uppercase tracking-wider">
            <Sparkles size={14} />
            {tx(lang, "What's new", "新功能")}
          </div>
          <div
            style={{
              transform: `translateX(${dragX}px)`,
              transition: isDragging ? "none" : "transform 500ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <h2 className="font-display text-xl font-bold text-foreground mt-1">{current.title}</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{current.desc}</p>

            <div className="mt-4">{current.illustration}</div>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-4">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={close} className="text-muted-foreground">
              {tx(lang, "Skip", "略過")}
            </Button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                  {tx(lang, "Back", "返回")}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => (isLast ? close() : setStep((s) => s + 1))}
              >
                {isLast
                  ? tx(lang, "Got it", "了解")
                  : tx(lang, "Next", "下一步")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsNewWalkthrough;
