import { useEffect, useState } from "react";

export default function TerraReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = (params.get("status") ?? "success").toLowerCase();
  const provider = (params.get("provider") ?? "").toUpperCase();
  const ok = status === "success";

  const returnParams = new URLSearchParams({
    tab: "more",
    page: "connect-apps",
    terra: ok ? "success" : "failure",
    native: "true",
  });
  if (provider) returnParams.set("provider", provider);

  const appDeepLink = `despia://oauth/?${returnParams.toString()}`;
  const webFallbackParams = new URLSearchParams(returnParams);
  webFallbackParams.delete("native");
  const webFallback = `https://pacecalculator.fun/?${webFallbackParams.toString()}`;

  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    window.location.href = appDeepLink;
    const t = setTimeout(() => setShowFallback(true), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="text-3xl mb-2">{ok ? "✅" : "⚠️"}</div>
        <h1 className="text-lg font-semibold mb-1 text-foreground">
          {ok ? "Connected" : "Connection failed"}
        </h1>
        <p className="text-sm text-muted-foreground mb-5">
          {ok
            ? "Tap below to return to the Runward app and finish syncing."
            : "Something went wrong. Tap below to return to the app and try again."}
        </p>
        <a
          href={appDeepLink}
          className="block w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground"
        >
          Open Runward app
        </a>
        {showFallback && (
          <a
            href={webFallback}
            className="mt-3 block text-sm text-muted-foreground underline"
          >
            Continue in browser
          </a>
        )}
      </div>
    </div>
  );
}
