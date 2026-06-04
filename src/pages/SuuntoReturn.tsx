import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SUUNTO_PENDING_REDIRECT_KEY = "suunto_pending_redirect_uri";

export default function SuuntoReturn() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") ?? "";
  const oauthError = params.get("error") ?? params.get("error_description") ?? "";
  const deeplinkScheme = params.get("deeplink_scheme") ?? "";
  const isBounce = !!deeplinkScheme;

  useEffect(() => {
    if (!isBounce) return;
    const forwarded = new URLSearchParams();
    if (code) forwarded.set("code", code);
    if (oauthError) forwarded.set("error", oauthError);
    const deepLink = `${deeplinkScheme}://oauth/suunto-return?${forwarded.toString()}`;
    const t = setTimeout(() => { window.location.href = deepLink; }, 200);
    return () => clearTimeout(t);
  }, [isBounce, deeplinkScheme, code, oauthError]);

  useEffect(() => {
    if (isBounce) return;
    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!code) {
      setError("Missing Suunto authorization code");
      return;
    }

    const redirect_uri = localStorage.getItem(SUUNTO_PENDING_REDIRECT_KEY)
      ?? `${window.location.origin}/suunto-return`;

    supabase.functions.invoke("suunto-callback", {
      body: { code, redirect_uri },
    }).then(({ data, error: invokeError }) => {
      if (invokeError || !(data as any)?.success) {
        throw new Error((data as any)?.error || invokeError?.message || "Callback failed");
      }
      localStorage.removeItem(SUUNTO_PENDING_REDIRECT_KEY);
      navigate("/admin?tab=suunto", { replace: true });
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [isBounce, code, oauthError, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="text-3xl mb-2">{error ? "⚠️" : "✅"}</div>
        <h1 className="text-lg font-semibold mb-1 text-foreground">
          {error ? "Suunto connection failed" : "Connecting Suunto"}
        </h1>
        <p className="text-sm text-muted-foreground break-words">
          {error ?? (isBounce ? "Returning to the app…" : "Finishing connection…")}
        </p>
      </div>
    </div>
  );
}