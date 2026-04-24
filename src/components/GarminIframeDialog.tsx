import { useEffect, useRef, useState } from "react";
import { X, AlertCircle } from "lucide-react";
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
 * Garmin's casEmbedSuccess.html calls XD.postMessage(JSON, parent_url, parent)
 * — parent_url comes from the `source` URL parameter we set to our origin.
 *
 * Listener is intentionally permissive (accepts "null" origins / EasyXDM
 * shim formats) because Garmin's CAS sometimes relays through anonymous
 * sandboxes.
 */
const GarminIframeDialog = ({ open, iframeUrl, lang, onTicket, onClose }: Props) => {
  const [received, setReceived] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [showTimeout, setShowTimeout] = useState(false);
  const handledRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      handledRef.current = false;
      setReceived(false);
      setIframeLoaded(false);
      setIframeError(false);
      setShowTimeout(false);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    console.log("[GarminIframe] 🟢 opening with URL:", iframeUrl);

    // After 90s with no ticket, show a "no ticket received" fallback so the
    // user isn't stuck in silent failure.
    timeoutRef.current = window.setTimeout(() => {
      if (!handledRef.current) setShowTimeout(true);
    }, 90_000);

    const onMessage = (ev: MessageEvent) => {
      console.log("[GarminIframe] 📬 postMessage", {
        origin: ev.origin,
        dataType: typeof ev.data,
        data: typeof ev.data === "string" ? ev.data.slice(0, 300) : ev.data,
      });

      if (handledRef.current) return;

      const raw = ev.data;
      let payload: { serviceTicket?: string; serviceUrl?: string } | null = null;

      if (typeof raw === "string") {
        try { payload = JSON.parse(raw); } catch { /* not JSON */ }
        if (!payload) {
          const match = raw.match(/\{[^}]*serviceTicket[^}]*\}/);
          if (match) {
            try { payload = JSON.parse(match[0]); } catch { /* ignore */ }
          }
        }
        if (!payload) {
          const tMatch = raw.match(/ST-[A-Za-z0-9_-]+/);
          if (tMatch) payload = { serviceTicket: tMatch[0] };
        }
      } else if (raw && typeof raw === "object") {
        payload = raw as { serviceTicket?: string; serviceUrl?: string };
      }

      const ticket = payload?.serviceTicket;
      if (typeof ticket === "string" && ticket.startsWith("ST-")) {
        handledRef.current = true;
        setReceived(true);
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        console.log("[GarminIframe] ✅ ticket extracted:", ticket.slice(0, 20));
        onTicket(ticket);
      } else {
        console.log("[GarminIframe] ⏭ no serviceTicket in this message");
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [open, iframeUrl, onTicket]);

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

          {iframeError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/95 backdrop-blur-sm p-6 text-center">
              <AlertCircle size={32} className="text-destructive" />
              <p className="text-sm text-foreground font-medium">
                {lang === "zh" ? "無法載入 Garmin 登入頁面" : "Failed to load Garmin sign-in"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "zh"
                  ? "請檢查網路連線，或在桌面 Chrome 並允許第三方 Cookie。"
                  : "Check your connection, or use desktop Chrome with third-party cookies enabled."}
              </p>
              <button onClick={onClose} className="text-xs text-primary hover:underline mt-2">
                {lang === "zh" ? "關閉" : "Close"}
              </button>
            </div>
          )}

          {showTimeout && !received && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/95 backdrop-blur-sm p-6 text-center">
              <AlertCircle size={32} className="text-destructive" />
              <p className="text-sm text-foreground font-medium">
                {lang === "zh" ? "未收到 Garmin 登入回應" : "No response from Garmin"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "zh"
                  ? "Garmin 沒有回傳登入票證。可能原因：第三方 Cookie 被阻擋、隱私模式，或瀏覽器不支援。請改用桌面 Chrome 並允許第三方 Cookie。"
                  : "Garmin did not return a sign-in ticket. Common causes: third-party cookies blocked, incognito mode, or unsupported browser. Use desktop Chrome with third-party cookies enabled."}
              </p>
              <button onClick={onClose} className="text-xs text-primary hover:underline mt-2">
                {lang === "zh" ? "關閉並重試" : "Close and retry"}
              </button>
            </div>
          )}

          {!iframeLoaded && !iframeError && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}

          <iframe
            src={iframeUrl}
            title="Garmin sign-in"
            className="w-full h-full border-0"
            allow="clipboard-write; web-share"
            onLoad={() => {
              console.log("[GarminIframe] 🖼 iframe load event");
              setIframeLoaded(true);
            }}
            onError={() => {
              console.error("[GarminIframe] ❌ iframe error event");
              setIframeError(true);
            }}
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
