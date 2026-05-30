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
  const deeplinkScheme = params.get("deeplink_scheme") ?? "";

  // If deeplink_scheme is present, this page is running inside the in-app
  // secure browser (ASWebAuthenticationSession / Chrome Custom Tabs).
  // We bounce to <scheme>://oauth/terra-return?... which makes Despia close
  // the secure browser and re-open /terra-return in the main WebView
  // *without* deeplink_scheme — that second pass is where terra-confirm runs.
  const isBounce = !!deeplinkScheme;

  const [confirmState, setConfirmState] = useState<"idle" | "running" | "done">(
    isBounce ? "idle" : "running"
  );
  const native = typeof window !== "undefined" && isDespiaUA();

  // Bounce pass: fire the deep link as soon as the page mounts.
  useEffect(() => {
    if (!isBounce) return;
    const forwarded = new URLSearchParams();
    params.forEach((value, key) => {
      if (key === "deeplink_scheme") return;
      forwarded.set(key, value);
    });
    forwarded.set("terra", ok ? "success" : "failure");
    const deepLink = `${deeplinkScheme}://oauth/terra-return?${forwarded.toString()}`;
    // Small delay so the user sees the success UI briefly.
    const t = setTimeout(() => {
      window.location.href = deepLink;
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBounce]);

  // Confirm pass: only runs when we're NOT bouncing (i.e. main WebView or web).
  useEffect(() => {
    if (isBounce) return;
    if (!ok) return;
    let cancelled = false;
    (async () => {
      if (!provider || !terraUserId) {
        setConfirmState("done");
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("terra-confirm", {
          body: { provider, terra_user_id: terraUserId, reference_id: referenceId },
        });
        if (cancelled) return;
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
      } catch (e: any) {
        // terra-auth-init already eager-linked; the `auth` webhook will flip
        // active=true. Treat confirm errors as still-successful.
        console.error("[terra-return] confirm failed (non-fatal)", e);
      }
      if (!cancelled) setConfirmState("done");
    })();
    return () => { cancelled = true; };
  }, [isBounce, ok, provider, terraUserId, referenceId]);

  // After confirm, bounce the user back home in the native WebView so they
  // don't get stuck on this stub page.
  useEffect(() => {
    if (isBounce) return;
    if (!native) return;
    if (!ok) return;
    if (confirmState !== "done") return;
    const qs = new URLSearchParams();
    qs.set("page", "connect-apps");
    qs.set("terra", ok ? "success" : "failure");
    if (provider) qs.set("provider", provider);
    if (terraUserId) qs.set("terra_user_id", terraUserId);
    if (referenceId) qs.set("reference_id", referenceId);
    const t = setTimeout(() => {
      window.location.replace(`/?${qs.toString()}`);
    }, 500);
    return () => clearTimeout(t);
  }, [isBounce, native, ok, confirmState, provider, terraUserId, referenceId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="text-3xl mb-2">{ok ? "✅" : "⚠️"}</div>
        <h1 className="text-lg font-semibold mb-1 text-foreground">
          {ok ? "Connected" : "Connection failed"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ok && isBounce && "Returning to the app…"}
          {ok && !isBounce && confirmState === "running" && "Finalizing your connection…"}
          {ok && !isBounce && confirmState === "done" && (native
            ? "Returning to the app…"
            : "You may now close this browser.")}
          {!ok && "Please return to the app and try again."}
        </p>
      </div>
    </div>
  );
}
