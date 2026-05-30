import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Landing page for the Despia native OAuth bridge.
 *
 * After native-callback.html fires `runward://oauth/auth?access_token=...`,
 * Despia closes the secure browser and navigates the WebView here. We pull
 * the tokens out of the query string and hand them to Supabase.
 *
 * Also handles the standard web Supabase hash-fragment return as a
 * fallback (in case detectSessionInUrl is off and someone lands here).
 */
export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken =
      searchParams.get("access_token") || hash.get("access_token");
    const refreshToken =
      searchParams.get("refresh_token") || hash.get("refresh_token") || "";
    const oauthError =
      searchParams.get("error") ||
      hash.get("error") ||
      searchParams.get("error_description") ||
      hash.get("error_description");

    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!accessToken) {
      setError("Missing access_token");
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: setErr }) => {
        if (setErr) {
          setError(setErr.message);
          return;
        }
        // iOS WebView fix: after returning from ASWebAuthenticationSession,
        // the WebView's viewport / safe-area insets don't recalc on their
        // own — leaving a green status-bar strip and a shrunk layout until
        // the app is restarted. Poke the layout engine before navigating.
        try {
          // Force reflow + dispatch resize so anything reading
          // window.innerHeight / visualViewport / env(safe-area-*) updates.
          document.body.style.minHeight = "100vh";
          void document.body.offsetHeight;
          window.dispatchEvent(new Event("resize"));
          window.scrollTo(0, 1);
          window.scrollTo(0, 0);
          // Second pass after iOS finishes its own layout pass
          setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
            window.scrollTo(0, 0);
          }, 150);
        } catch {
          // best-effort
        }
        navigate("/", { replace: true });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
    // intentionally re-run if searchParams change (deeplink may arrive after mount)
  }, [searchParams, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3 px-6 text-center">
      {error ? (
        <>
          <p className="text-sm text-destructive">Sign in failed</p>
          <p className="text-xs text-muted-foreground break-all">{error}</p>
        </>
      ) : (
        <>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        </>
      )}
    </div>
  );
}
