import { useEffect, useState } from "react";

const GarminCallback = () => {
  const [message, setMessage] = useState<string>("Signing you in…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("ticket");
    const errorParam = params.get("error");

    if (!window.opener) {
      setMessage("This page must be opened from the app. You can close this tab.");
      return;
    }

    try {
      if (errorParam) {
        window.opener.postMessage(
          { type: "garmin-ticket-error", error: errorParam },
          window.location.origin
        );
        setMessage("Sign-in failed. You can close this window.");
      } else if (ticket) {
        window.opener.postMessage(
          { type: "garmin-ticket", ticket },
          window.location.origin
        );
        setMessage("Signed in! Closing…");
        setTimeout(() => window.close(), 300);
      } else {
        // No ticket and no error — Garmin sometimes redirects without params on the first hop.
        // Wait briefly to see if the page navigates again before reporting failure.
        setMessage("Waiting for Garmin…");
        setTimeout(() => {
          window.opener?.postMessage(
            { type: "garmin-ticket-error", error: "No ticket received" },
            window.location.origin
          );
          setMessage("No sign-in ticket received. You can close this window.");
        }, 4000);
      }
    } catch (e) {
      console.error("[GarminCallback] postMessage failed:", e);
      setMessage("Could not communicate with the app. You can close this window.");
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6 text-center gap-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
};

export default GarminCallback;
