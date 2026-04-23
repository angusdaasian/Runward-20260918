import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Status = "working" | "success" | "error";

const GarminCallback = () => {
  const [message, setMessage] = useState<string>("Signing you in…");
  const [status, setStatus] = useState<Status>("working");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("ticket");
    const errorParam = params.get("error");

    // Desktop popup flow: postMessage back to the opener and close.
    if (window.opener) {
      try {
        if (errorParam) {
          window.opener.postMessage(
            { type: "garmin-ticket-error", error: errorParam },
            window.location.origin
          );
          setStatus("error");
          setMessage("Sign-in failed. You can close this window.");
        } else if (ticket) {
          window.opener.postMessage(
            { type: "garmin-ticket", ticket },
            window.location.origin
          );
          setStatus("success");
          setMessage("Signed in! Closing…");
          setTimeout(() => window.close(), 300);
        } else {
          setMessage("Waiting for Garmin…");
          setTimeout(() => {
            window.opener?.postMessage(
              { type: "garmin-ticket-error", error: "No ticket received" },
              window.location.origin
            );
            setStatus("error");
            setMessage("No sign-in ticket received. You can close this window.");
          }, 4000);
        }
      } catch (e) {
        console.error("[GarminCallback] postMessage failed:", e);
        setStatus("error");
        setMessage("Could not communicate with the app. You can close this window.");
      }
      return;
    }

    // Mobile new-tab flow: exchange the ticket here, broadcast the result via localStorage,
    // and let the user close this tab manually with the X button.
    const callback = localStorage.getItem("garmin-sso-callback") || "";
    const broadcast = (result: { ok: boolean; displayName?: string; error?: string }) => {
      localStorage.setItem("garmin-sso-result", JSON.stringify(result));
      // Clean up callback hint so a future sign-in doesn't reuse a stale value.
      localStorage.removeItem("garmin-sso-callback");
    };

    if (errorParam) {
      broadcast({ ok: false, error: errorParam });
      setStatus("error");
      setMessage("Sign-in failed. You can close this tab and return to the app.");
      return;
    }

    if (!ticket) {
      // Garmin sometimes double-redirects without params; wait briefly before giving up.
      setMessage("Waiting for Garmin…");
      const timer = window.setTimeout(() => {
        broadcast({ ok: false, error: "No sign-in ticket received" });
        setStatus("error");
        setMessage("No sign-in ticket received. You can close this tab.");
      }, 4000);
      return () => window.clearTimeout(timer);
    }

    (async () => {
      setMessage("Finishing sign-in…");
      try {
        const { data, error } = await supabase.functions.invoke("garmin-sso-exchange", {
          body: { ticket, callback },
        });
        if (error || !data?.success) {
          const msg = data?.error || (error instanceof Error ? error.message : "Garmin connection failed");
          broadcast({ ok: false, error: msg });
          setStatus("error");
          setMessage(`Sign-in failed: ${msg}`);
        } else {
          broadcast({ ok: true, displayName: data.display_name });
          setStatus("success");
          setMessage("You're connected! Close this tab and return to the app.");
        }
      } catch (e) {
        console.error("[GarminCallback] exchange failed:", e);
        const msg = e instanceof Error ? e.message : "Unknown error";
        broadcast({ ok: false, error: msg });
        setStatus("error");
        setMessage(`Sign-in failed: ${msg}`);
      }
    })();
  }, []);

  const showCloseButton = !window.opener && status !== "working";

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background px-6 text-center gap-4">
      {showCloseButton && (
        <button
          type="button"
          onClick={() => window.close()}
          aria-label="Close"
          className="absolute top-4 right-4 inline-flex items-center justify-center h-10 w-10 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {status === "working" && (
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      )}
      {status === "success" && (
        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl">
          ✓
        </div>
      )}
      {status === "error" && (
        <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-2xl">
          !
        </div>
      )}

      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>

      {showCloseButton && (
        <button
          type="button"
          onClick={() => window.close()}
          className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Return to app
        </button>
      )}
    </div>
  );
};

export default GarminCallback;
