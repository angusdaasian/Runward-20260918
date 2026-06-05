import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Menu, ArrowRight, ChevronRight, Settings2, Hand,
  Activity, BarChart3, Heart, Moon,
} from "lucide-react";
import { Lang } from "@/lib/i18n";

const STORAGE_KEY = "walkthrough_v2026_06_simple_widgets_seen";

interface Props {
  lang: Lang;
  /** Walkthrough only triggers when this is true (e.g. on the activities tab, signed-in). */
  enabled: boolean;
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

    {/* Arrow + label */}
    <div className="flex items-center justify-end gap-1 mt-1 pr-1">
      <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
        {tx(lang, "Tap menu", "點選選單")}
      </span>
      <ArrowRight size={12} className="text-primary" />
    </div>

    {/* Mock menu popover */}
    <div className="ml-auto mt-2 w-[80%] rounded-lg bg-card border-2 border-primary shadow-lg p-2">
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
    {/* Top bar with Customize button */}
    <div className="flex items-center justify-between mb-2">
      <div className="h-2.5 w-20 rounded bg-foreground/40" />
      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold ring-2 ring-primary/30">
        <Settings2 size={11} />
        {tx(lang, "Customize", "自訂")}
      </div>
    </div>

    {/* 2x2 widget grid */}
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

    {/* Annotations */}
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
          {tx(lang, "Customize: pick widgets or switch to classic view", "自訂：選擇小工具或切換經典版面")}
        </span>
      </div>
    </div>
  </div>
);

/* -------------------- Component -------------------- */

const WhatsNewWalkthrough = ({ lang, enabled }: Props) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") return;
    } catch { /* storage may be unavailable */ }
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [enabled]);

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch { /* ignore */ }
    setOpen(false);
  };

  const steps = [
    {
      title: tx(lang, "Meet Simple Mode", "認識簡易模式"),
      desc: tx(
        lang,
        "Hide advanced tabs (like Analytics) for a cleaner experience. Toggle anytime from the menu in the top-right.",
        "隱藏進階分頁（例如數據分析），介面更清爽。隨時可從右上角選單切換。"
      ),
      illustration: <SimpleModeIllustration lang={lang} />,
    },
    {
      title: tx(lang, "New Widget Analytics", "全新小工具數據分析"),
      desc: tx(
        lang,
        "Your Analytics tab is now a personalised widget board. Tap to open, long-press to rearrange, and use Customize to pick widgets or switch back to the classic view.",
        "「數據分析」分頁現已升級為個人化小工具版面。點選查看、長按可拖曳排序，使用「自訂」選擇小工具或切換回經典版面。"
      ),
      illustration: <WidgetsIllustration lang={lang} />,
    },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-background to-background p-5">
          <div className="flex items-center gap-2 text-primary text-[11px] font-semibold uppercase tracking-wider">
            <Sparkles size={14} />
            {tx(lang, "What's new", "新功能")}
          </div>
          <h2 className="font-display text-xl font-bold text-foreground mt-1">{current.title}</h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{current.desc}</p>

          <div className="mt-4">{current.illustration}</div>

          {/* Progress dots */}
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
