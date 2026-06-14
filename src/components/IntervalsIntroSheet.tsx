import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Zap, ChevronDown, ChevronUp } from "lucide-react";
import { Lang } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
  busy?: boolean;
  lang: Lang;
}

export default function IntervalsIntroSheet({ open, onOpenChange, onContinue, busy, lang }: Props) {
  const zh = lang === "zh";
  const L = (en: string, z: string) => (zh ? z : en);
  const [showNew, setShowNew] = useState(true);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <div className="mx-auto max-w-md pt-2 pb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Zap className="w-7 h-7 text-primary" />
          </div>

          <SheetHeader className="text-left space-y-2 mb-4">
            <SheetTitle className="text-2xl font-bold">
              {L("Takes about 2 minutes", "大約只需 2 分鐘")}
            </SheetTitle>
            <SheetDescription className="text-base text-muted-foreground leading-relaxed">
              {zh ? (
                <>
                  我們會帶你前往 <strong className="text-foreground">intervals.icu</strong> — 一個免費連結你手錶數據的服務。
                </>
              ) : (
                <>
                  We'll send you to <strong className="text-foreground">intervals.icu</strong> — a free service that mirrors your watch data. Works with{" "}
                  <strong className="text-foreground">Garmin, COROS, Polar, Wahoo, and more.</strong>
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mb-5">
            <Step n={1} text={L(
              "Sign in to intervals.icu (or create a free account).",
              "登入 intervals.icu（或建立免費帳號）。",
            )} />
            <Step n={2} text={L(
              "Tap Authorize — and you're back here, connected.",
              "點選「Authorize」即可返回並完成連結。",
            )} bold="Authorize" />
          </div>

          <div className="border-t border-border pt-4 mb-4">
            <button
              type="button"
              onClick={() => setShowNew(v => !v)}
              className="w-full flex items-center justify-between text-primary font-medium text-sm"
            >
              <span>{L("New to intervals.icu? Here's all it takes", "第一次使用 intervals.icu？只需幾步")}</span>
              {showNew ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showNew && (
              <div className="mt-3 bg-muted/60 rounded-xl p-4 space-y-2 text-sm text-foreground">
                <p><strong>1.</strong> {L("Create a free account at intervals.icu", "在 intervals.icu 建立免費帳號")}</p>
                <p><strong>2.</strong> {L("On their site, link Garmin Connect (or your watch's account)", "在他們的網站連結 Garmin Connect（或你的手錶帳號）")}</p>
                <p><strong>3.</strong> {L("Come back, tap Authorize — done", "回來點 Authorize — 完成")}</p>
              </div>
            )}
          </div>

          <Button
            onClick={onContinue}
            disabled={busy}
            className="w-full h-12 rounded-full text-base font-semibold"
          >
            {busy ? "..." : L("Continue to intervals.icu", "前往 intervals.icu")}
          </Button>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full mt-2 text-sm text-muted-foreground py-2"
          >
            {L("Not now", "暫時不要")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Step({ n, text, bold }: { n: number; text: string; bold?: string }) {
  const parts = bold ? text.split(bold) : [text];
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold flex-shrink-0">
        {n}
      </div>
      <p className="text-sm leading-relaxed text-foreground pt-0.5">
        {bold ? (
          <>
            {parts[0]}<strong>{bold}</strong>{parts[1]}
          </>
        ) : text}
      </p>
    </div>
  );
}
