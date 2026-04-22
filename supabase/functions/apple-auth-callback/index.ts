import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ORIGINS = new Set([
  "https://pacecalculator.fun",
  "https://www.pacecalculator.fun",
  "https://angustest.site",
  "https://www.angustest.site",
]);
const DEFAULT_ORIGIN = "https://pacecalculator.fun";

/**
 * Resolve a safe base origin from the redirect_uri provided in state.
 * - Full URL with allowlisted origin → use that origin
 * - Relative path or anything else → fall back to DEFAULT_ORIGIN
 */
function resolveBaseOrigin(redirectUri: string): string {
  if (!redirectUri) return DEFAULT_ORIGIN;
  if (redirectUri.startsWith("http://") || redirectUri.startsWith("https://")) {
    try {
      const u = new URL(redirectUri);
      if (ALLOWED_ORIGINS.has(u.origin)) return u.origin;
    } catch {
      // fall through
    }
    return DEFAULT_ORIGIN;
  }
  // Relative path — preserve previous behavior
  return DEFAULT_ORIGIN;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let baseOrigin = DEFAULT_ORIGIN;

  try {
    let code: string | null = null;
    let id_token: string | null = null;
    let stateRaw: string | null = null;
    let userInfo: string | null = null;

    // Apple sends a form-encoded POST to the callback URL
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";

      if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await req.formData();
        code = formData.get("code") as string | null;
        id_token = formData.get("id_token") as string | null;
        stateRaw = formData.get("state") as string | null;
        userInfo = formData.get("user") as string | null;
      } else if (contentType.includes("application/json")) {
        const body = await req.json();
        code = body.code || null;
        id_token = body.id_token || null;
        stateRaw = body.state || null;
      }
    }

    console.log("[apple-auth-callback] Received:", {
      hasCode: !!code,
      hasIdToken: !!id_token,
      hasState: !!stateRaw,
      hasUserInfo: !!userInfo,
      method: req.method,
    });

    // Parse state to get nonce and redirect_uri
    let nonce: string | undefined;
    let redirectUri = "";
    if (stateRaw) {
      try {
        const stateObj = JSON.parse(stateRaw);
        nonce = stateObj.nonce;
        redirectUri = stateObj.redirect_uri || "";
      } catch {
        nonce = stateRaw;
      }
    }

    baseOrigin = resolveBaseOrigin(redirectUri);

    if (!id_token) {
      console.error("[apple-auth-callback] Missing id_token");
      return new Response(null, {
        status: 302,
        headers: { Location: `${baseOrigin}/callback/apple?error=missing_id_token` },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Exchange Apple's id_token for a Supabase session
    const { data, error } = await supabaseAdmin.auth.signInWithIdToken({
      provider: "apple",
      token: id_token,
      nonce: nonce,
    });

    if (error) {
      console.error("[apple-auth-callback] signInWithIdToken error:", error);
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${baseOrigin}/callback/apple?error=${encodeURIComponent(error.message)}`,
        },
      });
    }

    console.log("[apple-auth-callback] Auth successful, user:", data.user?.id);

    // If Apple sent user info (first sign-in only), update the profile
    if (userInfo && data.user) {
      try {
        const user = JSON.parse(userInfo);
        const displayName = [user.name?.firstName, user.name?.lastName].filter(Boolean).join(" ");
        if (displayName) {
          await supabaseAdmin
            .from("profiles")
            .update({ display_name: displayName })
            .eq("user_id", data.user.id);
          console.log("[apple-auth-callback] Updated profile with name:", displayName);
        }
      } catch (e) {
        console.warn("[apple-auth-callback] Failed to parse user info:", e);
      }
    }

    // Redirect back to the frontend with tokens in the hash
    const hashParams = new URLSearchParams({
      access_token: data.session?.access_token || "",
      refresh_token: data.session?.refresh_token || "",
      expires_in: String(data.session?.expires_in || 3600),
      token_type: "bearer",
      type: "apple",
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${baseOrigin}/callback/apple#${hashParams.toString()}`,
      },
    });
  } catch (err) {
    console.error("[apple-auth-callback] Unexpected error:", err);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${baseOrigin}/callback/apple?error=internal_error`,
      },
    });
  }
});
