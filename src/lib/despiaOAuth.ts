/**
 * Despia native OAuth bridge helper.
 *
 * Despia requires OAuth to go through its `oauth://` bridge on both iOS
 * and Android. The bridge opens a secure browser session (ASWebAuthSession
 * on iOS / Chrome Custom Tabs on Android), runs the provider redirect, and
 * then closes when the page fires `runward://oauth/...`.
 *
 * Flow:
 *   1. UA-detect Despia
 *   2. Build a Supabase OAuth URL whose redirect_to is /native-callback.html
 *      (implicit flow so tokens land in the URL hash)
 *   3. Call `despia('oauth://?url=' + encoded)`
 *   4. native-callback.html re-emits the tokens via runward://oauth/auth?...
 *   5. Despia closes the browser, navigates the WebView to /auth?access_token=...
 *   6. /auth route calls supabase.auth.setSession()
 *
 * Web (non-Despia) keeps the standard signInWithOAuth() redirect.
 */

const DEEPLINK_SCHEME = "runward";
const SUPABASE_URL = "https://kbghvclwhxnjeskdodeh.supabase.co";

export function isDespiaUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator.userAgent || "").toLowerCase().includes("despia");
}

type SupportedProvider = "google" | "apple";

/**
 * Returns true if the native bridge was invoked. Callers should fall back
 * to supabase.auth.signInWithOAuth() when this returns false.
 */
export function startDespiaOAuth(provider: SupportedProvider): boolean {
  if (!isDespiaUA()) return false;

  const despia = (window as any).despia;
  if (typeof despia !== "function") {
    // Despia UA present but bridge missing — fall back to web flow.
    return false;
  }

  const origin = window.location.origin;
  const redirectUrl =
    `${origin}/native-callback.html?deeplink_scheme=${encodeURIComponent(DEEPLINK_SCHEME)}`;

  const oauthUrl =
    `${SUPABASE_URL}/auth/v1/authorize?` +
    new URLSearchParams({
      provider,
      redirect_to: redirectUrl,
      scopes: "openid email profile",
      flow_type: "implicit", // tokens delivered in URL hash to native-callback.html
    }).toString();

  despia(`oauth://?url=${encodeURIComponent(oauthUrl)}`);
  return true;
}
