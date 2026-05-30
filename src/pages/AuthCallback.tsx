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
