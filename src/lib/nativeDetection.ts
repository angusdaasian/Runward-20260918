/**
 * Detect whether the app is running inside the Despia native wrapper
 * or in a regular web browser.
 *
 * Despia-only signals (strict — mobile Safari must NOT match):
 * 1. ?native=true query parameter (configure Despia start URL with this)
 * 2. User-Agent contains "despia" or "median"
 * 3. navigator.standalone === true (iOS standalone WebView / PWA)
 *
 * Anything else (mobile Safari, mobile Chrome, desktop) → web → landing page.
 */

const STORAGE_KEY = "runward_native_app";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const ua = navigator.userAgent || "";
  const path = window.location.pathname;

  // OAuth / callback routes — always show full app so callbacks complete
  if (/\/(callback|auth|strava|garmin|terra|suunto|polar)/i.test(path)) {
    return true;
  }

  // ?dev=true bypass for testing in a browser
  if (params.get("dev") === "true") {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 1. Explicit ?native=true flag (set this in the Despia start URL)
  if (params.get("native") === "true") {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 2. UA token from the Despia wrapper.
  // Do NOT trust window.despia/window.median here: the public website loads
  // despia-native from index.html, so those globals can exist in desktop Safari/Chrome.
  if (/despia|median/i.test(ua)) {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 3. iOS standalone WebView (Despia's iOS shell sets this)
  if ((navigator as any).standalone === true) {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 4. Cached result — only honor cached "true" if any active signal also
  // matched above. Since none did, clear stale cache so a mobile Safari
  // visitor who was previously misdetected isn't stuck on Index forever.
  if (localStorage.getItem(STORAGE_KEY) === "true") {
    localStorage.removeItem(STORAGE_KEY);
  }

  localStorage.setItem(STORAGE_KEY, "false");
  return false;
}

/** Force re-detect (useful after login deep-links) */
export function clearNativeDetection(): void {
  localStorage.removeItem(STORAGE_KEY);
}
