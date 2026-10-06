import { ArrowRight, History, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Props {
  providerName: string;
  lang: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

export default function WatchIntroSheet({ providerName, lang, open, onOpenChange, onContinue }: Props) {
  const zh = lang === "zh";
  const steps = [
    {
      title: zh ? `登入你的 ${providerName} 帳號` : `Sign in to your ${providerName} account`,
      text: zh ? "使用平日同步手錶的帳號，我們會帶你前往授權頁面。" : "Use the account you normally sync your watch with. We'll take you to its permission screen.",
    },
    {
      title: zh ? "允許分享活動及每日健康數據" : "Allow activities and daily health stats",
      text: zh ? "在授權頁面開啟「Activities」及「Daily Health Stats」（如有提供）。不同品牌的名稱可能略有不同。" : "Turn on Activities and Daily Health Stats where available. The names may differ between watch brands.",
    },
    {
      title: zh ? "想匯入過往活動？記得開啟歷史權限" : "Want your past runs? Allow historical data",
      text: zh ? "如希望匯入過往活動，請開啟「Historical Data／歷史數據」。Garmin 的授權頁面會顯示此開關；關閉它可能令過往活動無法匯入。" : "If you'd like to import past activities, turn on Historical Data on the permission screen. Garmin shows this switch; leaving it off may prevent past runs from being shared.",
    },
    {
      title: zh ? "確認授權，然後返回 RunWard" : "Approve, then return to RunWard",
      text: zh ? "完成連接後，我們會自動同步可用的活動。首次匯入可能需要幾分鐘，毋須一直留在此頁。" : "Once connected, we'll sync the activities available to us. The first import can take a few minutes — no need to stay on this page.",
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl">
        <div className="mx-auto max-w-md pb-4 pt-2">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><Watch aria-hidden="true" /></div>
          <SheetHeader className="mb-6 space-y-2 text-left">
            <SheetTitle className="text-2xl">{zh ? "一起連接你的手錶" : "Let's connect your watch"}</SheetTitle>
            <SheetDescription className="text-base leading-relaxed">{zh ? "只需幾個小步驟，就能把跑步和健康數據帶到 RunWard。" : "A few simple steps to bring your runs and health data into RunWard."}</SheetDescription>
          </SheetHeader>
          <ol className="mb-5 space-y-5">
            {steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span>
                <div className="min-w-0"><h3 className="text-sm font-semibold text-foreground">{step.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.text}</p></div>
              </li>
            ))}
          </ol>
          <div className="mb-5 flex gap-3 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p>{zh ? "免費帳號可匯入最近 30 天的活動；Premium 可使用完整歷史匯入。歷史權限只代表允許分享，不會改變你的帳號匯入上限。" : "Free accounts import the last 30 days. Premium unlocks full-history import. Historical permission lets your watch share past data; it doesn't change your account's import limit."}</p>
          </div>
          <Button onClick={onContinue} className="h-12 w-full whitespace-normal text-base">{zh ? `繼續連接 ${providerName}` : `Continue to ${providerName}`}<ArrowRight aria-hidden="true" /></Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="mt-2 w-full text-muted-foreground">{zh ? "稍後再連接" : "Maybe later"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}