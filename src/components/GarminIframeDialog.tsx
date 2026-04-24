import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Lang } from "@/lib/i18n";

interface Props {
  open: boolean;
  iframeUrl: string;
  lang: Lang;
  onTicket: (ticket: string) => void;
  onClose: () => void;
}

/**
 * Renders Garmin's SSO sign-in inside an iframe. After successful login,
 * Garmin's casEmbedSuccess.html calls window.parent.postMessage(...) with
 * a JSON payload containing { serviceTicket, serviceUrl }. We listen for
 * that and hand the ticket to the parent component for backend exchange.
 *
 * NOTE: third-party cookies must be allowed in the user's browser for the
 * iframe to receive its session cookies. Works in Chrome normal mode; can
 * fail in Safari, Firefox, and incognito mode.
 */
const GarminIframeDialog = ({ open, iframeUrl, lang, onTicket, onClose }: Props) => {
  const [received, setReceived] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!open) {
      handledRef.current = false;
      setReceived(false);
      return;
    }

    const onMessage = (ev: MessageEvent) => {
      // Only accept messages from Garmin's SSO origin
      if (ev.origin !== "https://sso.garmin.com") return;
      if (handledRef.current) return;

      const raw = ev.data;
      let payload: { serviceTicket?: string; serviceUrl?: string } | null = null;

      if (typeof raw === "string") {
        try { payload = JSON.parse(raw); } catch { payload = null; }
      } else if (raw && typeof raw === "object") {
        payload = raw as { serviceTicket?: string; serviceUrl?: string };
      }

      const ticket = payload?.serviceTicket;
      if (typeof ticket === "string" && ticket.startsWith("ST-")) {
        handledRef.current = true;
        setReceived(true);
        console.log("[GarminIframe] received ticket via postMessage");
        onTicket(ticket);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, onTicket]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md h-[640px] max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-medium text-sm text-foreground">
            {lang === "zh" ? "登入 Garmin Connect" : "Sign in to Garmin Connect"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="relative flex-1 bg-background">
          {received && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/95 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                <p className="text-sm text-muted-foreground">
                  {lang === "zh" ? "完成連結中…" : "Finishing connection…"}
                </p>
              </div>
            </div>
          )}
          <iframe
            src={iframeUrl}
            title="Garmin sign-in"
            className="w-full h-full border-0"
            // sandbox intentionally omitted: Garmin's CAS needs same-origin
            // scripts, popups for "forgot password", and form submission.
            allow="clipboard-write; web-share"
          />
        </div>

        <div className="px-4 py-2.5 border-t border-border bg-muted/30">
          <p className="text-[11px] text-muted-foreground leading-snug">
            {lang === "zh"
              ? "Garmin 在此框架中處理你的密碼及兩步驟驗證 — 我們不會看到。如果無法載入，請在桌面 Chrome 並允許第三方 Cookie。"
              : "Garmin handles your password and 2-step verification inside this frame — we never see them. If it doesn't load, use desktop Chrome with third-party cookies enabled."}
          </p>
        </div>
      </div>
    </div>
  );
};

export default GarminIframeDialog;
