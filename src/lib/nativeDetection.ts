/**
 * Detect whether the app is running inside the Despia native wrapper
 * or in a regular web browser.
 *
 * Priority:
 * 1. ?native=true query parameter
 * 2. navigator.standalone (iOS PWA / native shell)
 * 3. Despia / median JS bridge globals
 * 4. Default → web (landing page)
 *
 * Result is cached in localStorage so subsequent navigations skip detection.
 */

const STORAGE_KEY = "runward_native_app";

export function isNativeApp(): boolean {
  const params = new URLSearchParams(window.location.search);
  const ua = navigator.userAgent || '';
  const host = window.location.hostname;

  // 0. OAuth / callback routes — always show full app
  const path = window.location.pathname;
  if (/\/(callback|auth|strava)/i.test(path)) {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 0b. ?dev=true bypass — always show full app
  if (params.get("dev") === "true") {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 1. ?native=true explicit flag
  if (params.get("native") === "true") {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 2. navigator.standalone (iOS PWA / native shell / Despia)
  if ((navigator as any).standalone === true) {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 3. Despia / Median JS bridge globals
  if (typeof (window as any).median !== "undefined" || typeof (window as any).despia !== "undefined") {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 4. WebView detection via User-Agent (covers Despia, native wrappers)
  const isWebView = /wv|WebView|(iPhone|iPod|iPad)(?!.*Safari)|Android.*Version\/[\d.]+/i.test(ua);
  if (isWebView) {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 5. Mobile on production domain → likely Despia app
  const isProdDomain = host === 'runward.app' || host === 'www.runward.app' || /\.netlify\.app$/i.test(host);
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  if (isMobile && isProdDomain) {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }

  // 6. Check cache (after all active detection, so new signals always win)
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached === "true") return true;
  if (cached === "false") return false;

  // 7. Default — desktop/mobile web browser → show landing page
  localStorage.setItem(STORAGE_KEY, "false");
  return false;
}

/** Force re-detect (useful after login deep-links) */
export function clearNativeDetection(): void {
  localStorage.removeItem(STORAGE_KEY);
}
