import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function StrideeReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status") ?? "error";
  const strideeUserId = params.get("user_id") ?? "";
  const [done, setDone] = useState(false);
  const [external, setExternal] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (status === "success" && strideeUserId) {
          await supabase.functions.invoke("stridee-connect", { body: { action: "confirm_public", stridee_user_id: strideeUserId } }).catch(() => {});
        }
        // Opened in the outside browser: ask the user to go back to the app.
        setExternal(true);
        setDone(true);
        return;
      }
      if (status === "success") {
        await supabase.functions.invoke("stridee-connect", { body: { action: "confirm", stridee_user_id: strideeUserId } }).catch(() => {});
      }
      setDone(true);
      setTimeout(() => window.location.replace("/?page=connect-apps"), 800);
    })();
  }, [status, strideeUserId]);

  const msg = status === "success" ? "Garmin connected ✓" : status === "denied" ? "Connection cancelled" : "Connection failed";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center space-y-3">
        <h1 className="text-lg font-semibold text-foreground">{msg}</h1>
        {external ? (
          <>
            <p className="text-sm text-muted-foreground">
              {status === "success"
                ? "You can close this page and return to the RunWard app. 已成功連接，請返回 RunWard App。"
                : "Please return to the RunWard app and try again. 請返回 RunWard App 再試一次。"}
            </p>
            <a
              href="runward://"
              className="inline-block w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              Open RunWard App 返回 App
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {status === "success"
              ? (done ? "Connected. Returning to RunWard…" : "Saving your connection…")
              : done ? "Returning to RunWard…" : "…"}
          </p>
        )}
      </div>
    </div>
  );
}
