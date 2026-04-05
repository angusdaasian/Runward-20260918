import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const redirectUri = url.searchParams.get("redirect_uri");

    if (!redirectUri) {
      return new Response(
        JSON.stringify({ error: "Missing redirect_uri" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Apple OAuth configuration
    const clientId = "com.despia.runward.web";

    // Generate a random state for CSRF protection
    const stateBytes = new Uint8Array(32);
    crypto.getRandomValues(stateBytes);
    const state = Array.from(stateBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Generate raw nonce
    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    const rawNonce = Array.from(nonceBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Apple requires the SHA-256 hash of the nonce in the authorization URL
    // Supabase expects the raw nonce when calling signInWithIdToken
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawNonce));
    const hashedNonce = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // The callback URL is the apple-auth-callback edge function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const callbackUrl = `${supabaseUrl}/functions/v1/apple-auth-callback`;

    // Build Apple authorization URL
    // Apple requires response_mode=form_post for the callback
    const appleAuthUrl = new URL("https://appleid.apple.com/auth/authorize");
    appleAuthUrl.searchParams.set("client_id", clientId);
    appleAuthUrl.searchParams.set("redirect_uri", callbackUrl);
    appleAuthUrl.searchParams.set("response_type", "code id_token");
    appleAuthUrl.searchParams.set("response_mode", "form_post");
    appleAuthUrl.searchParams.set("scope", "name email");
    // Pass raw nonce in state so callback can give it to Supabase
    appleAuthUrl.searchParams.set("state", JSON.stringify({ nonce: rawNonce, redirect_uri: redirectUri }));
    // Send hashed nonce to Apple (Apple embeds this in the id_token)
    appleAuthUrl.searchParams.set("nonce", hashedNonce);

    console.log("[apple-auth-start] Redirecting to Apple with callback:", callbackUrl);

    // Redirect user to Apple's authorization page
    return new Response(null, {
      status: 302,
      headers: {
        Location: appleAuthUrl.toString(),
      },
    });
  } catch (err) {
    console.error("[apple-auth-start] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
