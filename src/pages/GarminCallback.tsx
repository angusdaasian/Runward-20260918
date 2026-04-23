import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const GarminCallback = () => {
  const [message, setMessage] = useState<string>("Signing you in…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("ticket");
    const errorParam = params.get("error");

    // Mobile/redirect flow: no opener — we landed here as a full-page navigation.
    // Exchange the ticket on this page, then redirect back to the connect-apps view.
    if (!window.opener) {
      const callback = sessionStorage.getItem("garmin-sso-callback") || "";
      const returnUrl = "/?tab=more&page=connect-apps";

      if (errorParam) {
        sessionStorage.setItem("garmin-sso-result", JSON.stringify({ ok: false, error: errorParam }));
        sessionStorage.removeItem("garmin-sso-pending");
        window.location.replace(returnUrl);
        return;
      }

      if (!ticket) {
        sessionStorage.setItem(
          "garmin-sso-result",
          JSON.stringify({ ok: false, error: "No sign-in ticket received" })
        );
        sessionStorage.removeItem("garmin-sso-pending");
        setTimeout(() => window.location.replace(returnUrl), 1500);
        return;
      }

      (async () => {
        setMessage("Finishing sign-in…");
        try {
          const { data, error } = await supabase.functions.invoke("garmin-sso-exchange", {
            body: { ticket, callback },
          });
          if (error || !data?.success) {
            const msg = data?.error || (error instanceof Error ? error.message : "Garmin connection failed");
            sessionStorage.setItem("garmin-sso-result", JSON.stringify({ ok: false, error: msg }));
          } else {
            sessionStorage.setItem(
              "garmin-sso-result",
              JSON.stringify({ ok: true, displayName: data.display_name })
            );
          }
        } catch (e) {
          console.error("[GarminCallback] exchange failed:", e);
          sessionStorage.setItem(
            "garmin-sso-result",
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" })
          );
        } finally {
          sessionStorage.removeItem("garmin-sso-pending");
          sessionStorage.removeItem("garmin-sso-callback");
          window.location.replace(returnUrl);
        }
      })();
      return;
    }

    // Desktop/popup flow: postMessage back to the opener and close.
    try {
      if (errorParam) {
        window.opener.postMessage(
          { type: "garmin-ticket-error", error: errorParam },
          window.location.origin
        );
        setMessage("Sign-in failed. You can close this window.");
      } else if (ticket) {
        window.opener.postMessage(
          { type: "garmin-ticket", ticket },
          window.location.origin
        );
        setMessage("Signed in! Closing…");
        setTimeout(() => window.close(), 300);
      } else {
        setMessage("Waiting for Garmin…");
        setTimeout(() => {
          window.opener?.postMessage(
            { type: "garmin-ticket-error", error: "No ticket received" },
            window.location.origin
          );
          setMessage("No sign-in ticket received. You can close this window.");
        }, 4000);
      }
    } catch (e) {
      console.error("[GarminCallback] postMessage failed:", e);
      setMessage("Could not communicate with the app. You can close this window.");
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6 text-center gap-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
};

export default GarminCallback;
