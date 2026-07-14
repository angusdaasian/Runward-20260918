/**
 * Detect the platform the user is running on.
 *
 * Priority:
 *   1. Despia/Median native wrapper → inspect UA for iOS vs Android tokens
 *   2. Plain mobile browser → still return "ios" / "android" so we know their device
 *   3. Otherwise → "web"
 */
import { supabase } from "@/integrations/supabase/client";

export type Platform = "ios" | "android" | "web";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "web";
  const ua = (navigator.userAgent || "").toLowerCase();

  // iOS detection (also covers iPadOS 13+ which reports as Mac + touch)
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (ua.includes("mac") && typeof document !== "undefined" && "ontouchend" in document);

  if (isIOS) return "ios";
  if (/android/.test(ua)) return "android";
  return "web";
}

/** Write detected platform to the user's profile (best-effort, non-blocking). */
export async function syncPlatformToProfile(userId: string): Promise<void> {
  try {
    const platform = detectPlatform();
    await supabase
      .from("profiles")
      .update({ platform, platform_updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch (e) {
    console.warn("[Platform] Failed to sync platform:", e);
  }
}
