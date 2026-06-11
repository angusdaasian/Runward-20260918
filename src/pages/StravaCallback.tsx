import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Handles Strava OAuth redirect at /auth/callback.
 * Strava sends ?code=...&state=...&scope=... back to this URL after the user
 * approves access. We forward code+state to the `strava-callback` edge function,
 * which exchanges the code and stores the connection.
 */
export default function StravaCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state") ?? undefined;
    const oauthError = searchParams.get("error") || searchParams.get("error_description");

    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!code) {
      setError("Missing authorization code");
      return;
    }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // We're in the external system browser opened by Despia's oauth://
        // bridge — there's no Supabase session here. Bounce back into the
        // in-app WebView via the runward:// deeplink so it can finish the
        // token exchange (mirrors the Suunto flow).
        const forwarded = new URLSearchParams();
        forwarded.set("code", code);
        if (state) forwarded.set("state", state);
        const deepLink = `runward://oauth/auth/callback?${forwarded.toString()}`;
        window.location.href = deepLink;
        setTimeout(() => {
          setError("Please sign in again before connecting Strava");
        }, 3000);
        return;
      }
      const { error: fnErr } = await supabase.functions.invoke("strava-callback", {
        body: { code, state },
      });
      if (fnErr) {
        setError(fnErr.message);
        toast.error("Strava connection failed");
        return;
      }
      toast.success("Strava connected");
      const origin = localStorage.getItem("fitness_pending_origin");
      localStorage.removeItem("fitness_pending_origin");
      if (origin === "dashboard") {
        navigate("/dashboard?view=connect", { replace: true });
      } else {
        navigate("/?page=connect-apps", { replace: true });
      }
    })();

  }, [searchParams, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3 px-6 text-center">
      {error ? (
        <>
          <p className="text-sm text-destructive">Strava connection failed</p>
          <p className="text-xs text-muted-foreground break-all">{error}</p>
          <button
            onClick={() => navigate("/", { replace: true })}
            className="mt-4 text-xs underline text-muted-foreground"
          >
            Back to app
          </button>
        </>
      ) : (
        <>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Connecting Strava…</p>
        </>
      )}
    </div>
  );
}
