import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SUUNTO_PENDING_REDIRECT_KEY = "suunto_pending_redirect_uri";
const DEEPLINK_SCHEME = "runward";

export default function SuuntoReturn() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [bouncing, setBouncing] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") ?? "";
  const oauthError = params.get("error") ?? params.get("error_description") ?? "";

  useEffect(() => {
    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!code) {
      setError("Missing Suunto authorization code");
      return;
    }

    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      // If there's no Supabase session here, we're almost certainly running in the
      // external system browser opened by Despia's oauth:// bridge. Bounce back into
      // the app via the runward:// deeplink so the in-app WebView (which has the
      // session) can finish the token exchange.
      if (!session?.access_token) {
        const forwarded = new URLSearchParams();
        if (code) forwarded.set("code", code);
        const deepLink = `${DEEPLINK_SCHEME}://oauth/suunto-return?${forwarded.toString()}`;
        setBouncing(true);
        window.location.href = deepLink;
        // Fallback message if deeplink doesn't fire (e.g. opened in plain browser)
        setTimeout(() => {
          if (!cancelled) {
            setError("Please sign in again before connecting Suunto");
            setBouncing(false);
          }
        }, 3000);
        return;
      }

      const redirect_uri = localStorage.getItem(SUUNTO_PENDING_REDIRECT_KEY)
        ?? `${window.location.origin}/suunto/callback`;

      try {
        const { data, error: invokeError } = await supabase.functions.invoke("suunto-callback", {
          body: { code, redirect_uri },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError || !(data as any)?.success) {
          throw new Error((data as any)?.error || invokeError?.message || "Callback failed");
        }
        localStorage.removeItem(SUUNTO_PENDING_REDIRECT_KEY);
        localStorage.removeItem("suunto_pending_native");
        navigate("/admin?tab=suunto", { replace: true });
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => { cancelled = true; };
  }, [code, oauthError, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="text-3xl mb-2">{error ? "⚠️" : "✅"}</div>
        <h1 className="text-lg font-semibold mb-1 text-foreground">
          {error ? "Suunto connection failed" : bouncing ? "Returning to app" : "Connecting Suunto"}
        </h1>
        <p className="text-sm text-muted-foreground break-words">
          {error ?? (bouncing ? "Closing browser…" : "Finishing connection…")}
        </p>
      </div>
    </div>
  );
}
