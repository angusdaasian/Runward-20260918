import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Runs inside Despia's in-app browser (oauth:// session). Opens Stridee/Garmin,
// then watches for the connection. Navigating to runward://oauth/... makes
// Despia close the in-app browser and bring the user back into RunWard.
export default function StrideeBridge() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("url") ?? "";
  const sid = params.get("sid") ?? "";
  const [opened, setOpened] = useState(false);
  const done = useRef(false);

  const backToApp = (status = "resume") => {
    if (done.current) return;
    done.current = true;
    const q = new URLSearchParams({ status });
    if (sid) q.set("user_id", sid);
    window.location.href = `runward://oauth/stridee-return?${q.toString()}`;
  };

  const openGarmin = () => {
    if (!url.startsWith("https://")) return;
    setOpened(true);
    const w = window.open(url, "_blank");
    if (!w) window.location.href = url; // popups blocked: go in the same window
  };

  useEffect(() => {
    if (!sid) return;
    const check = async () => {
      const { data } = await supabase.functions.invoke("stridee-connect", {
        body: { action: "status_public", stridee_user_id: sid },
      });
      if ((data as any)?.connected) backToApp("success");
    };
    const t = setInterval(() => void check(), 3000);
    const onResume = () => {
      if (document.visibilityState !== "visible") return;
      // Garmin runs in a second browser page. Once RunWard becomes active again,
      // dismiss this original Despia OAuth session immediately instead of waiting
      // for the connection-status request to win a race with the native resume.
      if (opened) backToApp("resume");
      else void check();
    };
    document.addEventListener("visibilitychange", onResume);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [sid, opened]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Connect Garmin 連結 Garmin</h1>
        <p className="text-sm text-muted-foreground">
          {opened
            ? "After approving Garmin, come back here — this window closes by itself. 授權後返回此頁，視窗會自動關閉。"
            : "Tap below to sign in to Garmin. 點擊下方登入 Garmin。"}
        </p>
        <Button className="w-full" onClick={openGarmin}>Continue to Garmin 前往 Garmin</Button>
        <Button variant="outline" className="w-full" onClick={() => backToApp()}>
          Done — back to RunWard 完成，返回 App
        </Button>
      </div>
    </main>
  );
}
