import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

type Mode = "latest" | "today" | "week";

const TerraSyncTester = () => {
  const [busy, setBusy] = useState<Mode | null>(null);
  const [lastResult, setLastResult] = useState<string>("");

  const callSync = async (mode: Mode) => {
    if (busy) return;
    setBusy(mode);
    setLastResult("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      let url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/terra-sync`;
      let body: Record<string, unknown> = { forceEnv: "prod" };

      if (mode === "latest") {
        body = { dayOnly: true, latestWithSamples: true, forceEnv: "prod" };
      } else if (mode === "today") {
        url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/terra-sync-today`;
        body = { forceEnv: "prod" };
      } else if (mode === "week") {
        const nowHkt = new Date(Date.now() + 8 * 60 * 60 * 1000);
        const start = new Date(nowHkt.getTime() - 7 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        const tomorrow = new Date(nowHkt.getTime() + 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        body = { startDate: start, endDate: tomorrow, forceEnv: "prod" };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      const pretty = JSON.stringify(result, null, 2);
      setLastResult(pretty);
      if (!response.ok) throw new Error(result?.error ?? `Sync failed (${response.status})`);
      const count = result?.activities ?? 0;
      toast.success(`${mode}: synced ${count} activity(ies)`);
    } catch (err: any) {
      console.error(`[admin terra-sync ${mode}]`, err);
      toast.error(err?.message || "Sync failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Terra Sync Tester</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Runs against your own connected Terra accounts using <code>forceEnv: "prod"</code>.
            Use this to validate sync behaviour before re-enabling the controls in the Activities tab.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => callSync("latest")} disabled={busy !== null}>
              <RefreshCw className={`h-4 w-4 mr-2 ${busy === "latest" ? "animate-spin" : ""}`} />
              Sync latest activity
            </Button>
            <Button variant="outline" onClick={() => callSync("today")} disabled={busy !== null}>
              <RefreshCw className={`h-4 w-4 mr-2 ${busy === "today" ? "animate-spin" : ""}`} />
              Sync today's activities
            </Button>
            <Button variant="outline" onClick={() => callSync("week")} disabled={busy !== null}>
              <RefreshCw className={`h-4 w-4 mr-2 ${busy === "week" ? "animate-spin" : ""}`} />
              Sync last 7 days
            </Button>
          </div>
          {lastResult && (
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-[480px]">
              {lastResult}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TerraSyncTester;
