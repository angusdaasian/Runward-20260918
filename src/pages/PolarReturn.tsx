import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const POLAR_PENDING_REDIRECT_KEY = "polar_pending_redirect_uri";
const DEEPLINK_SCHEME = "runward";

export default function PolarReturn() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [bouncing, setBouncing] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") ?? "";
  const oauthError = params.get("error") ?? params.get("error_description") ?? "";

  useEffect(() => {
    if (oauthError) { setError(oauthError); return; }
    if (!code) { setError("Missing Polar authorization code"); return; }

    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        const forwarded = new URLSearchParams();
        if (code) forwarded.set("code", code);
        const deepLink = `${DEEPLINK_SCHEME}://oauth/polar-return?${forwarded.toString()}`;
        setBouncing(true);
        window.location.href = deepLink;
        setTimeout(() => {
          if (!cancelled) {
            setError("Please sign in again before connecting Polar");
            setBouncing(false);
          }
        }, 3000);
        return;
      }

      const redirect_uri = localStorage.getItem(POLAR_PENDING_REDIRECT_KEY)
        ?? `${window.location.origin}/polar/callback`;

      try {
        const { data, error: invokeError } = await supabase.functions.invoke("polar-callback", {
          body: { code, redirect_uri },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError || !(data as any)?.success) {
          throw new Error((data as any)?.error || invokeError?.message || "Callback failed");
        }
        localStorage.removeItem(POLAR_PENDING_REDIRECT_KEY);
        localStorage.removeItem("polar_pending_native");
        const origin = localStorage.getItem("polar_pending_origin");
        localStorage.removeItem("polar_pending_origin");
        if (origin === "admin") {
          navigate("/admin?tab=polar", { replace: true });
        } else {
          navigate("/?page=connect-apps", { replace: true });
        }
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
          {error ? "Polar connection failed" : bouncing ? "Returning to app" : "Connecting Polar"}
        </h1>
        <p className="text-sm text-muted-foreground break-words">
          {error ?? (bouncing ? "Closing browser…" : "Finishing connection…")}
        </p>
      </div>
    </div>
  );
}
