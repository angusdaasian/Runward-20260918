import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function StrideeReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status") ?? "error";
  const strideeUserId = params.get("user_id") ?? "";
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (status === "success" && strideeUserId) {
          await supabase.functions.invoke("stridee-connect", { body: { action: "confirm_public", stridee_user_id: strideeUserId } }).catch(() => {});
        }
        // Opened in the secure in-app browser: hand back to the app WebView.
        setDone(true);
        window.location.replace(`runward://oauth/stridee-return?${params.toString()}`);
        return;
      }
      if (status === "success") {
        await supabase.functions.invoke("stridee-connect", { body: { action: "confirm", stridee_user_id: strideeUserId } }).catch(() => {});
      }
      setDone(true);
      setTimeout(() => window.location.replace("/?page=connect-apps"), 800);
    })();
  }, [status, strideeUserId]);

  const msg = status === "success" ? "Garmin connected" : status === "denied" ? "Connection cancelled" : "Connection failed";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">{msg}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {status === "success"
            ? (done ? "Connected. Returning to RunWard…" : "Saving your connection…")
            : done ? "Returning to RunWard…" : "…"}
        </p>
      </div>
    </div>
  );
}
