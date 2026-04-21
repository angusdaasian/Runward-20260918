import { useEffect, useState } from "react";

/**
 * Tracks whether the device currently has network connectivity.
 * Uses navigator.onLine + window 'online'/'offline' events.
 *
 * Note: navigator.onLine can occasionally report a false positive (the device
 * is connected to a network but has no actual internet). For our use cases
 * (gating Supabase reads/writes), it's good enough — failed fetches will
 * still fall through to cached data.
 */
export function useOnlineStatus(): { online: boolean } {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { online };
}

/** Imperative check (non-reactive). Useful inside event handlers. */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
