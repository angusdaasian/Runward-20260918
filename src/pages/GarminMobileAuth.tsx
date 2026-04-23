import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearGarminSsoTransientState,
  GARMIN_SSO_EMBED_SERVICE_URL,
  GARMIN_SSO_KEYS,
  GARMIN_SSO_RETURN_URL,
  setGarminSsoResult,
} from "@/lib/garminSso";

const GarminMobileAuth = () => {
  const [message, setMessage] = useState("Continue in Garmin to finish sign-in…");
  const lang = useMemo(() => (localStorage.getItem("app_lang") as "en" | "zh") || "en", []);
  const embedUrl = sessionStorage.getItem(GARMIN_SSO_KEYS.mobileEmbedUrl) || "";
  const serviceUrl = sessionStorage.getItem(GARMIN_SSO_KEYS.mobileServiceUrl) || GARMIN_SSO_EMBED_SERVICE_URL;

  useEffect(() => {
    let settled = false;
    let timeoutId: number | undefined;

    const finish = async (ticket: string) => {
      if (settled) return;
      settled = true;
      setMessage(lang === "zh" ? "正在完成 Garmin 登入…" : "Finishing Garmin sign-in…");

      try {
        const { data, error } = await supabase.functions.invoke("garmin-sso-exchange", {
          body: { ticket, callback: serviceUrl, serviceUrl },
        });

        if (error || !data?.success) {
          const msg = data?.error || (error instanceof Error ? error.message : "Garmin connection failed");
          setGarminSsoResult({ ok: false, error: msg });
        } else {
          setGarminSsoResult({ ok: true, displayName: data.display_name });
        }
      } catch (error) {
        setGarminSsoResult({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        clearGarminSsoTransientState();
        window.location.replace(GARMIN_SSO_RETURN_URL);
      }
    };

    if (!embedUrl) {
      setGarminSsoResult({
        ok: false,
        error: lang === "zh" ? "Garmin 登入工作階段已失效，請再試一次" : "Garmin sign-in session expired. Please try again.",
      });
      clearGarminSsoTransientState();
      window.location.replace(GARMIN_SSO_RETURN_URL);
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "https://sso.garmin.com") return;

      let payload = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }

      if (!payload || typeof payload !== "object") return;

      const ticket = "serviceTicket" in payload ? payload.serviceTicket : ("ticket" in payload ? payload.ticket : null);
      if (typeof ticket === "string" && ticket.startsWith("ST-")) {
        void finish(ticket);
      }
    };

    timeoutId = window.setTimeout(() => {
      if (settled) return;
      setGarminSsoResult({
        ok: false,
        error: lang === "zh" ? "Garmin 登入逾時，請再試一次" : "Garmin sign-in timed out. Please try again.",
      });
      clearGarminSsoTransientState();
      window.location.replace(GARMIN_SSO_RETURN_URL);
    }, 5 * 60 * 1000);

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [embedUrl, lang, serviceUrl]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex items-center justify-center border-b border-border px-4 py-3 text-sm text-muted-foreground">
        {message}
      </div>
      <div className="flex-1 bg-background">
        <iframe
          title="Garmin sign-in"
          src={embedUrl}
          className="h-full w-full border-0 bg-background"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
};

export default GarminMobileAuth;