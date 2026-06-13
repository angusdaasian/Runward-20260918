import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEEPLINK_SCHEME = "runward";

/**
 * Handles intervals.icu OAuth redirect at /intervals-callback.
 * intervals.icu sends ?code=...&state=... back to this URL. We forward to the
 * `intervals-callback` edge function to exchange the code for tokens.
 *
 * Mirrors StravaCallback / SuuntoReturn: if there's no Supabase session in this
 * tab (we came back via Despia's oauth:// bridge in an external browser), bounce
 * into the app via the runward:// deeplink so the in-app WebView can finish.
 */
export default function IntervalsCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
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
        const forwarded = new URLSearchParams();
        forwarded.set("code", code);
        const deepLink = `${DEEPLINK_SCHEME}://oauth/intervals-callback?${forwarded.toString()}`;
        window.location.href = deepLink;
        setTimeout(() => {
          setError("Please sign in again before connecting intervals.icu");
        }, 3000);
        return;
      }
      const redirect_uri = `${window.location.origin}/intervals-callback`;
      const { error: fnErr } = await supabase.functions.invoke("intervals-callback", {
        body: { code, redirect_uri },
      });
      if (fnErr) {
        setError(fnErr.message);
        toast.error("intervals.icu connection failed");
        return;
      }
      toast.success("intervals.icu connected");
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
          <p className="text-sm text-destructive">intervals.icu connection failed</p>
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
          <p className="text-sm text-muted-foreground">Connecting intervals.icu…</p>
        </>
      )}
    </div>
  );
}
