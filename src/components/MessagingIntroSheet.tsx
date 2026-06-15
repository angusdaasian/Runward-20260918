import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MessageCircle, Send } from "lucide-react";
import { Lang } from "@/lib/i18n";
import whatsappTutorial from "@/assets/whatsapp-link-tutorial.png";
import telegramTutorial from "@/assets/telegram-link-tutorial.png";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
  busy?: boolean;
  lang: Lang;
  variant: "whatsapp" | "telegram";
}

export default function MessagingIntroSheet({ open, onOpenChange, onContinue, busy, lang, variant }: Props) {
  const zh = lang === "zh";
  const L = (en: string, z: string) => (zh ? z : en);
  const isWa = variant === "whatsapp";

  const Icon = isWa ? MessageCircle : Send;
  const brand = isWa ? "WhatsApp" : "Telegram";
  const image = isWa ? whatsappTutorial : telegramTutorial;

  const domain = isWa ? "wa.me" : "t.me";
  const step1Text = L(
    `A system prompt "RunWard wants to use ${domain} to Sign In" appears. Tap Continue.`,
    `系統會彈出「RunWard 想要使用 ${domain} 登入」，點擊 Continue。`,
  );
  const step1Bold = "Continue";

  const step2Text = L(
    `Then "Open in ${brand}?" appears. Tap Open.`,
    `接著彈出「在 ${brand} 中打開？」，點擊 Open。`,
  );
  const step2Bold = "Open";

  const step3Text = isWa
    ? L(
        'A message "LINK xxxxxx" is pre-filled. Tap the green Send button to finish.',
        '訊息「LINK xxxxxx」已自動填好，按綠色「傳送」按鈕完成連結。',
      )
    : L(
        '/start is sent automatically — you\'re linked instantly.',
        '系統會自動傳送 /start，立即完成連結。',
      );
  const step3Bold = isWa ? "Send" : undefined;


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <div className="mx-auto max-w-md pt-2 pb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Icon className="w-7 h-7 text-primary" />
          </div>

          <SheetHeader className="text-left space-y-2 mb-4">
            <SheetTitle className="text-2xl font-bold">
              {L(`Connect ${brand} in 2 taps`, `兩步連結 ${brand}`)}
            </SheetTitle>
            <SheetDescription className="text-base text-muted-foreground leading-relaxed">
              {L(
                `We'll open ${brand} so you can confirm the link with our bot. Here's what to expect:`,
                `我們會打開 ${brand}，讓你向我們的機器人確認連結。以下是流程：`,
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="rounded-2xl overflow-hidden bg-muted/40 mb-5 border border-border">
            <img
              src={image}
              alt={`${brand} link tutorial`}
              loading="lazy"
              width={768}
              height={512}
              className="w-full h-auto"
            />
          </div>

          <div className="space-y-4 mb-5">
            <Step n={1} text={step1Text} bold={step1Bold} />
            <Step n={2} text={step2Text} bold={step2Bold} />
            <Step n={3} text={step3Text} bold={step3Bold} />
          </div>


          <p className="text-xs text-muted-foreground mb-4">
            {L(
              "The link code is valid for 15 minutes. You can disconnect anytime.",
              "連結碼 15 分鐘內有效，可隨時取消連結。",
            )}
          </p>

          <Button
            onClick={onContinue}
            disabled={busy}
            className="w-full h-12 rounded-full text-base font-semibold"
          >
            {busy ? "..." : L(`Continue to ${brand}`, `前往 ${brand}`)}
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
