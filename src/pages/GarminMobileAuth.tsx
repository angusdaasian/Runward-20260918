import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearGarminSsoTransientState,
  GARMIN_SSO_EMBED_SERVICE_URL,
  GARMIN_SSO_KEYS,
  GARMIN_SSO_RETURN_URL,
  getGarminSsoValue,
  setGarminSsoResult,
  setGarminSsoValue,
} from "@/lib/garminSso";

const GarminMobileAuth = () => {
  const [message, setMessage] = useState("Continue in Garmin to finish sign-in…");
  const [diagnostics, setDiagnostics] = useState<string>("");
  const lang = useMemo(() => (localStorage.getItem("app_lang") as "en" | "zh") || "en", []);
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const isPopupMode = query.get("popup") === "1";
  const isNativeBridgeMode = query.get("native") === "1";
  const deeplinkScheme = query.get("deeplinkScheme") || "runward";
  const ticketFromQuery = query.get("ticket");
  const errorParam = query.get("error");
  const embedUrl = query.get("embedUrl") || getGarminSsoValue(GARMIN_SSO_KEYS.mobileEmbedUrl) || "";
  const serviceUrl = query.get("serviceUrl") || getGarminSsoValue(GARMIN_SSO_KEYS.mobileServiceUrl) || GARMIN_SSO_EMBED_SERVICE_URL;

  useEffect(() => {
    let settled = false;
    let timeoutId: number | undefined;

    const returnToNativeApp = (params: { ticket?: string; error?: string }) => {
      const target = new URL(`${deeplinkScheme}://oauth/garmin-mobile-auth`);
      if (params.ticket) target.searchParams.set("ticket", params.ticket);
      if (params.error) target.searchParams.set("error", params.error);
      if (serviceUrl) target.searchParams.set("serviceUrl", serviceUrl);
      window.location.replace(target.toString());
    };

    const finishAndReturn = (result: { ok: boolean; displayName?: string; error?: string }) => {
      console.log("[GarminMobileAuth] finishing", { result, isPopupMode, serviceUrl });
      setGarminSsoResult(result);
      clearGarminSsoTransientState();
      if (isPopupMode && window.opener) {
        window.opener.postMessage({ type: "garmin-mobile-result", result }, window.location.origin);
        window.close();
        return;
      }
      if (isPopupMode) {
        window.close();
        return;
      }
      // Delay redirect so on-screen diagnostics remain visible briefly.
      window.setTimeout(() => {
        window.location.replace(GARMIN_SSO_RETURN_URL);
      }, 2000);
    };

    const waitForSession = async () => {
      const maxAttempts = 6; // 6 × 500ms = 3s
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) return data.session;
        console.log(`[GarminMobileAuth] no session yet, retrying… (${attempt + 1}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return null;
    };

    const finish = async (ticket: string) => {
      if (settled) return;
      settled = true;
      setMessage(lang === "zh" ? "正在完成 Garmin 登入…" : "Finishing Garmin sign-in…");
      console.log("[GarminMobileAuth] exchanging ticket", { ticket, serviceUrl });

      setDiagnostics(
        `Ticket: ${ticket.substring(0, 20)}…\n` +
        `Service URL: ${serviceUrl}\n` +
        `Session: ⏳ checking…`,
      );

      const session = await waitForSession();
      if (!session) {
        const msg = lang === "zh"
          ? "登入工作階段未載入。請重新開啟應用程式並重試。"
          : "Session not loaded. Please reopen the app and retry.";
        setDiagnostics(
          `Ticket: ${ticket.substring(0, 20)}…\n` +
          `Service URL: ${serviceUrl}\n` +
          `Session: ❌ not found after 3s\n` +
          `Error: ${msg}`,
        );
        finishAndReturn({ ok: false, error: msg });
        return;
      }

      setDiagnostics(
        `Ticket: ${ticket.substring(0, 20)}…\n` +
        `Service URL: ${serviceUrl}\n` +
        `Session: ✅ found\n` +
        `Exchanging…`,
      );

      try {
        const { data, error } = await supabase.functions.invoke("garmin-sso-exchange", {
          body: { ticket, callback: serviceUrl, serviceUrl },
        });

        if (error || !data?.success) {
          const msg = data?.error || (error instanceof Error ? error.message : "Garmin connection failed");
          setDiagnostics(
            `Ticket: ${ticket.substring(0, 20)}…\n` +
            `Service URL: ${serviceUrl}\n` +
            `Session: ✅ found\n` +
            `❌ Exchange failed\n` +
            `Error: ${msg}`,
          );
          finishAndReturn({ ok: false, error: msg });
        } else {
          setDiagnostics(
            `Ticket: ${ticket.substring(0, 20)}…\n` +
            `Service URL: ${serviceUrl}\n` +
            `Session: ✅ found\n` +
            `✅ Success!\n` +
            `Display name: ${data.display_name}`,
          );
          finishAndReturn({ ok: true, displayName: data.display_name });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        setDiagnostics(
          `Ticket: ${ticket.substring(0, 20)}…\n` +
          `Service URL: ${serviceUrl}\n` +
          `❌ Exception\n` +
          `Error: ${msg}`,
        );
        finishAndReturn({ ok: false, error: msg });
      }
    };

    if (isNativeBridgeMode && errorParam) {
      returnToNativeApp({ error: errorParam });
      return;
    }

    if (isNativeBridgeMode && ticketFromQuery) {
      returnToNativeApp({ ticket: ticketFromQuery });
      return;
    }

    if (errorParam) {
      setDiagnostics(`Garmin returned error: ${errorParam}`);
      finishAndReturn({ ok: false, error: errorParam });
      return;
    }

    if (ticketFromQuery) {
      setGarminSsoValue(GARMIN_SSO_KEYS.pending, "1");
      void finish(ticketFromQuery);
      return;
    }

    if (!embedUrl) {
      finishAndReturn({
        ok: false,
        error: lang === "zh" ? "Garmin 登入工作階段已失效，請再試一次" : "Garmin sign-in session expired. Please try again.",
      });
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
        console.log("[GarminMobileAuth] received Garmin postMessage ticket", { ticket, serviceUrl, isNativeBridgeMode });
        if (isNativeBridgeMode) {
          returnToNativeApp({ ticket });
          return;
        }
        void finish(ticket);
      }
    };

    timeoutId = window.setTimeout(() => {
      if (settled) return;
      if (isNativeBridgeMode) {
        returnToNativeApp({
          error: lang === "zh" ? "Garmin 登入逾時，請再試一次" : "Garmin sign-in timed out. Please try again.",
        });
        return;
      }
      finishAndReturn({
        ok: false,
        error: lang === "zh" ? "Garmin 登入逾時，請再試一次" : "Garmin sign-in timed out. Please try again.",
      });
    }, 5 * 60 * 1000);

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [deeplinkScheme, embedUrl, errorParam, isNativeBridgeMode, isPopupMode, lang, serviceUrl, ticketFromQuery]);

  const showDiagnostics = Boolean(diagnostics);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex items-center justify-center border-b border-border px-4 py-3 text-sm text-muted-foreground">
        {message}
      </div>
      {showDiagnostics && (
        <div className="mx-4 mt-4 rounded-lg border border-border bg-muted p-4">
          <div className="font-mono text-xs whitespace-pre-wrap break-all text-foreground">{diagnostics}</div>
        </div>
      )}
      <div className="flex-1 bg-background">
        {ticketFromQuery || errorParam ? null : (
          <iframe
            title="Garmin sign-in"
            src={embedUrl}
            className="h-full w-full border-0 bg-background"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
      </div>
    </div>
  );
};

export default GarminMobileAuth;
