import { useEffect } from "react";
import { isDespiaUA } from "@/lib/despiaOAuth";

export default function TerraReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = (params.get("status") ?? params.get("terra") ?? "success").toLowerCase();
  const ok = status === "success";
  const provider = params.get("provider") ?? params.get("resource") ?? "";
  const terraUserId = params.get("user_id") ?? "";
  const referenceId = params.get("reference_id") ?? "";
  const deeplinkScheme = params.get("deeplink_scheme") ?? "";

  // Bounce pass: inside the in-app secure browser. Fire a deeplink that
  // Despia intercepts to close the browser and reopen the main WebView at
  // /?page=connect-apps with the connection params, so ConnectApps can flip
  // to ✓ immediately and run terra-confirm in the background.
  const isBounce = !!deeplinkScheme;
  const native = typeof window !== "undefined" && isDespiaUA();

  useEffect(() => {
    if (!isBounce) return;
    const forwarded = new URLSearchParams();
    forwarded.set("page", "connect-apps");
    forwarded.set("terra", ok ? "success" : "failure");
    if (provider) forwarded.set("provider", provider);
    if (terraUserId) forwarded.set("terra_user_id", terraUserId);
    if (referenceId) forwarded.set("reference_id", referenceId);
    const deepLink = `${deeplinkScheme}://oauth/terra-return?${forwarded.toString()}`;
    const t = setTimeout(() => { window.location.href = deepLink; }, 200);
    return () => clearTimeout(t);
  }, [isBounce, deeplinkScheme, ok, provider, terraUserId, referenceId]);

  // Non-bounce native pass: redirect straight into the app's ConnectApps
  // tab — no waiting on terra-confirm here, ConnectApps handles it.
  useEffect(() => {
    if (isBounce) return;
    if (!native) return;
    const qs = new URLSearchParams();
    qs.set("page", "connect-apps");
    qs.set("terra", ok ? "success" : "failure");
    if (provider) qs.set("provider", provider);
    if (terraUserId) qs.set("terra_user_id", terraUserId);
    if (referenceId) qs.set("reference_id", referenceId);
    const t = setTimeout(() => {
      window.location.replace(`/?${qs.toString()}`);
    }, 200);
    return () => clearTimeout(t);
  }, [isBounce, native, ok, provider, terraUserId, referenceId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="text-3xl mb-2">{ok ? "✅" : "⚠️"}</div>
        <h1 className="text-lg font-semibold mb-1 text-foreground">
          {ok ? "Connected" : "Connection failed"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ok && (isBounce || native) && "Returning to the app…"}
          {ok && !isBounce && !native && "You may now close this browser."}
          {!ok && "Please return to the app and try again."}
        </p>
      </div>
    </div>
  );
}
