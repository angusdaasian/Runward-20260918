import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDespiaUA } from "@/lib/despiaOAuth";

export default function TerraReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = (params.get("status") ?? params.get("terra") ?? "success").toLowerCase();
  const ok = status === "success";
  const provider = params.get("provider") ?? params.get("resource") ?? "";
  const terraUserId = params.get("user_id") ?? "";
  const referenceId = params.get("reference_id") ?? "";

  const [confirmState, setConfirmState] = useState<"idle" | "running" | "done" | "error">("idle");
  const native = typeof window !== "undefined" && isDespiaUA();

  useEffect(() => {
    if (!ok) return;
    let cancelled = false;
    (async () => {
      // Only call terra-confirm when we actually have the Terra user_id in the
      // URL. On the in-app deep-link path we have it (forwarded by
      // terra-callback.html). If it's missing, the `auth` webhook will
      // reconcile in the background — no need to error.
      if (!provider || !terraUserId) {
        setConfirmState("done");
        return;
      }
      setConfirmState("running");
      try {
        const { data, error } = await supabase.functions.invoke("terra-confirm", {
          body: { provider, terra_user_id: terraUserId, reference_id: referenceId },
        });
        if (cancelled) return;
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        setConfirmState("done");
      } catch (e: any) {
        if (cancelled) return;
        console.error("[terra-return] confirm failed", e);
        // The connection is already eagerly linked by terra-auth-init and the
        // `auth` webhook will flip active=true once Terra delivers it. So
        // treat confirm errors as "still connected, just finalizing".
        setConfirmState("done");
      }
    })();
    return () => { cancelled = true; };
  }, [ok, provider, terraUserId, referenceId]);

  // In the native WebView the user is already back in the app — bounce them
  // home automatically so they don't have to tap.
  useEffect(() => {
    if (!native) return;
    if (!ok) return;
    if (confirmState !== "done") return;
    const t = setTimeout(() => {
      window.location.replace(`/?terra=${ok ? "success" : "failure"}`);
    }, 600);
    return () => clearTimeout(t);
  }, [native, ok, confirmState]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="text-3xl mb-2">{ok ? "✅" : "⚠️"}</div>
        <h1 className="text-lg font-semibold mb-1 text-foreground">
          {ok ? "Connected" : "Connection failed"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ok && confirmState === "running" && "Finalizing your connection…"}
          {ok && confirmState !== "running" && (native
            ? "Returning to the app…"
            : "You may now close this browser.")}
          {!ok && "Please return to the app and try again."}
        </p>
      </div>
    </div>
  );
}
