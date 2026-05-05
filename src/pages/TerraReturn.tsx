export default function TerraReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = (params.get("status") ?? "success").toLowerCase();
  const ok = status === "success";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="text-3xl mb-2">{ok ? "✅" : "⚠️"}</div>
        <h1 className="text-lg font-semibold mb-1 text-foreground">
          {ok ? "Connected" : "Connection failed"}
        </h1>
        <p className="text-sm text-muted-foreground">
          You may now close the browser and return to app.
        </p>
      </div>
    </div>
  );
}
