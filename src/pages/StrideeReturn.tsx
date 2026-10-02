import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export default function StrideeReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status") ?? "error";
  const isResume = status === "resume";
  const strideeUserId = params.get("user_id") ?? "";
  const segs = window.location.pathname.split("/").filter(Boolean);
  const isNativeReturn = segs.includes("native");
  const NAMES: Record<string, string> = { garmin: "Garmin", coros: "COROS", polar: "Polar", fitbit: "Fitbit", zepp: "Zepp (Amazfit)" };
  const brand = NAMES[(params.get("provider") ?? segs[segs.length - 1] ?? "").toLowerCase()] ?? "Watch";
  const [done, setDone] = useState(false);
  const [external, setExternal] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
       if (!session) {
         if (isResume) {
           setDone(true);
           setExternal(true);
           return;
         }
        if (status === "success" && strideeUserId) {
          await supabase.functions.invoke("stridee-connect", { body: { action: "confirm_public", stridee_user_id: strideeUserId } }).catch(() => {});
        }
          if (isNativeReturn) {
           const forwarded = new URLSearchParams();
           forwarded.set("status", status);
           if (strideeUserId) forwarded.set("user_id", strideeUserId);
            window.location.href = `runward://oauth/stridee-return?${forwarded.toString()}`;
           return;
         }
        // Opened in Safari: show the button and also try to jump back automatically.
        setExternal(true);
        setDone(true);
        const back = new URLSearchParams({ status });
        if (strideeUserId) back.set("user_id", strideeUserId);
        setTimeout(() => { window.location.href = `runward://oauth/stridee-return?${back.toString()}`; }, 600);
        return;
      }
      if (status === "success") {
        await supabase.functions.invoke("stridee-connect", { body: { action: "confirm", stridee_user_id: strideeUserId } }).catch(() => {});
      }
      setDone(true);
      setTimeout(() => window.location.replace("/?page=connect-apps"), 800);
    })();
   }, [status, strideeUserId, isNativeReturn, isResume]);

  const msg = status === "success" ? `${brand} connected successfully ✓ 已成功連接` : isResume ? "Returning to RunWard…" : status === "denied" ? "Connection cancelled" : "Connection failed";
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
            <Button asChild className="w-full">
              <a href={`runward://oauth/stridee-return?status=${encodeURIComponent(status)}&user_id=${encodeURIComponent(strideeUserId)}`}>
                Open RunWard App 返回 App
              </a>
            </Button>
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
