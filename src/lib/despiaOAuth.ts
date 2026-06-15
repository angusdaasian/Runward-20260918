/**
 * Despia native OAuth bridge helper.
 *
 * Despia requires OAuth to go through its `oauth://` bridge on both iOS
 * and Android. The bridge opens a secure browser session (ASWebAuthSession
 * on iOS / Chrome Custom Tabs on Android), runs the provider redirect, and
 * then closes when the page fires `runward://oauth/...`.
 *
 * Flow:
 *   1. Detect the Despia/native wrapper
 *   2. Build a Supabase OAuth URL whose redirect_to is /native-callback.html
 *      (implicit flow so tokens land in the URL hash)
 *   3. Call `despia('oauth://?url=' + encoded)`
 *   4. native-callback.html re-emits the tokens via runward://oauth/auth?...
 *   5. Despia closes the browser, navigates the WebView to /auth?access_token=...
 *   6. /auth route calls supabase.auth.setSession()
 *
 * Web keeps the standard signInWithOAuth() redirect.
 */

import despia from "despia-native";

const DEEPLINK_SCHEME = "runward";
const SUPABASE_URL = "https://kbghvclwhxnjeskdodeh.supabase.co";

export function isDespiaUA(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  // Only true UA markers — do NOT check `window.despia`, since the
  // despia-native npm package defines that global on plain web too.
  // `navigator.standalone` is also unreliable (true for any iOS PWA).
  return ua.includes("despia") || ua.includes("median");
}

type SupportedProvider = "google" | "apple";

/**
 * Returns true if the native bridge was invoked. Callers should fall back
 * to supabase.auth.signInWithOAuth() when this returns false.
 */
export function startDespiaOAuth(provider: SupportedProvider): boolean {
  if (!isDespiaUA()) return false;

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
