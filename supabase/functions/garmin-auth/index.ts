import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmac } from "https://deno.land/x/hmac@v2.0.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Garmin OAuth consumer credentials (from garmy / mitmproxy — these are public app credentials)
const CONSUMER_KEY = "fc3e99d2-118c-44b8-8ae3-03370dde24c0";
const CONSUMER_SECRET = "E08WAR897WEy2knn7aFBrvegVAf0AFdWBBF";
const USER_AGENT = "com.garmin.android.apps.connectmobile";
const DOMAIN = "garmin.com";

// --- OAuth1 signing helpers ---
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function oauth1Sign(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string = "",
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return await hmacSha1(signingKey, baseString);
}

function buildOAuth1Header(params: Record<string, string>): string {
  const parts = Object.keys(params)
    .filter((k) => k.startsWith("oauth_"))
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(params[k])}"`);
  return `OAuth ${parts.join(", ")}`;
}

// --- SSO Login Flow ---
async function garminLogin(
  email: string,
  password: string,
): Promise<{
  oauth2Token: any;
  displayName: string;
}> {
  // Use a cookie jar approach with manual cookie tracking
  const cookies: Record<string, string> = {};

  function extractCookies(resp: Response) {
    for (const [key, value] of resp.headers.entries()) {
      if (key.toLowerCase() === "set-cookie") {
        const parts = value.split(";")[0].split("=");
        if (parts.length >= 2) {
          cookies[parts[0].trim()] = parts.slice(1).join("=").trim();
        }
      }
    }
  }

  function cookieHeader(): string {
    return Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  const SSO = `https://sso.${DOMAIN}/sso`;
  const SSO_EMBED = `${SSO}/embed`;

  const ssoEmbedParams = new URLSearchParams({
    id: "gauth-widget",
    embedWidget: "true",
    gauthHost: SSO,
  });

  const signinParams = new URLSearchParams({
    id: "gauth-widget",
    embedWidget: "true",
    gauthHost: SSO_EMBED,
    service: SSO_EMBED,
    source: SSO_EMBED,
    redirectAfterAccountLoginUrl: SSO_EMBED,
    redirectAfterAccountCreationUrl: SSO_EMBED,
  });

  // Step 1: Initialize SSO session
  const embedResp = await fetch(`${SSO}/embed?${ssoEmbedParams}`, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
  });
  extractCookies(embedResp);
  await embedResp.text(); // consume body

  // Step 2: Get CSRF token from signin page
  const signinResp = await fetch(`${SSO}/signin?${signinParams}`, {
    headers: { "User-Agent": USER_AGENT, Cookie: cookieHeader() },
    redirect: "manual",
  });
  extractCookies(signinResp);
  const signinHtml = await signinResp.text();

  const csrfMatch = signinHtml.match(/name="_csrf"\s+value="(.+?)"/);
  if (!csrfMatch) {
    throw new Error("Could not find CSRF token in Garmin SSO response");
  }
  const csrfToken = csrfMatch[1];

  // Step 3: Submit login form
  const loginBody = new URLSearchParams({
    username: email,
    password: password,
    embed: "true",
    _csrf: csrfToken,
  });

  const loginResp = await fetch(`${SSO}/signin?${signinParams}`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
      Referer: `${SSO}/signin?${signinParams}`,
    },
    body: loginBody.toString(),
    redirect: "manual",
  });
  extractCookies(loginResp);
  const loginHtml = await loginResp.text();

  // Check for MFA or failure
  const titleMatch = loginHtml.match(/<title>(.+?)<\/title>/);
  const title = titleMatch ? titleMatch[1] : "";

  if (title.includes("MFA")) {
    throw new Error("MFA_REQUIRED: Garmin account has MFA enabled. Please disable MFA temporarily or contact support.");
  }

  if (title !== "Success") {
    throw new Error(`Login failed: ${title || "Invalid credentials"}`);
  }

  // Step 4: Extract ticket
  const ticketMatch = loginHtml.match(/embed\?ticket=([^"]+)"/);
  if (!ticketMatch) {
    throw new Error("Could not find login ticket in response");
  }
  const ticket = ticketMatch[1];

  // Step 5: Exchange ticket for OAuth1 token
  const oauth1Params: Record<string, string> = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };

  const preAuthUrl = `https://connectapi.${DOMAIN}/oauth-service/oauth/preauthorized`;
  const preAuthFullParams = {
    ...oauth1Params,
    ticket,
    "login-url": `https://sso.${DOMAIN}/sso/embed`,
    "accepts-mfa-tokens": "true",
  };

  const sig1 = await oauth1Sign("GET", preAuthUrl, preAuthFullParams, CONSUMER_SECRET);
  preAuthFullParams["oauth_signature"] = sig1;

  const preAuthQuery = new URLSearchParams({
    ticket,
    "login-url": `https://sso.${DOMAIN}/sso/embed`,
    "accepts-mfa-tokens": "true",
  });

  const oauth1Header = buildOAuth1Header(preAuthFullParams);
  const preAuthResp = await fetch(`${preAuthUrl}?${preAuthQuery}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Authorization: oauth1Header,
    },
  });

  if (!preAuthResp.ok) {
    throw new Error(`OAuth1 token exchange failed: ${preAuthResp.status}`);
  }

  const preAuthText = await preAuthResp.text();
  const preAuthParsed = Object.fromEntries(new URLSearchParams(preAuthText));
  const oauthToken = preAuthParsed["oauth_token"] || "";
  const oauthTokenSecret = preAuthParsed["oauth_token_secret"] || "";

  if (!oauthToken || !oauthTokenSecret) {
    throw new Error("Failed to obtain OAuth1 tokens");
  }

  // Step 6: Exchange OAuth1 for OAuth2 token
  const exchangeUrl = `https://connectapi.${DOMAIN}/oauth-service/oauth/exchange/user/2.0`;
  const oauth2Params: Record<string, string> = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_token: oauthToken,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };

  const sig2 = await oauth1Sign("POST", exchangeUrl, oauth2Params, CONSUMER_SECRET, oauthTokenSecret);
  oauth2Params["oauth_signature"] = sig2;

  const oauth2Header = buildOAuth1Header(oauth2Params);
  const exchangeResp = await fetch(exchangeUrl, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Authorization: oauth2Header,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!exchangeResp.ok) {
    throw new Error(`OAuth2 exchange failed: ${exchangeResp.status}`);
  }

  const oauth2Token = await exchangeResp.json();

  // Calculate expiration timestamps
  const now = Math.floor(Date.now() / 1000);
  oauth2Token.expires_at = now + (oauth2Token.expires_in || 3600);
  oauth2Token.refresh_token_expires_at = now + (oauth2Token.refresh_token_expires_in || 7776000);

  // Get display name from profile
  let displayName = "";
  try {
    const profileResp = await fetch(`https://connectapi.${DOMAIN}/userprofile-service/socialProfile`, {
      headers: {
        "User-Agent": "GCM-iOS-5.12.24",
        Authorization: `Bearer ${oauth2Token.access_token}`,
      },
    });
    if (profileResp.ok) {
      const profile = await profileResp.json();
      displayName = profile.displayName || profile.userName || "";
    }
  } catch {
    /* ignore */
  }

  return { oauth2Token, displayName };
}

// --- Main handler ---
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate the Supabase user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, email, password } = await req.json();

    if (action === "connect") {
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { oauth2Token, displayName } = await garminLogin(email, password);

      // Store tokens in DB
      const { error: dbError } = await supabase.from("garmin_connections").upsert(
        {
          user_id: user.id,
          garmin_display_name: displayName,
          access_token: oauth2Token.access_token,
          refresh_token: oauth2Token.refresh_token || "",
          token_type: oauth2Token.token_type || "Bearer",
          expires_at: new Date(oauth2Token.expires_at * 1000).toISOString(),
          refresh_token_expires_at: new Date(oauth2Token.refresh_token_expires_at * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (dbError) {
        console.error("[garmin-auth] DB error:", dbError);
        throw new Error("Failed to store Garmin connection");
      }

      return new Response(JSON.stringify({ success: true, displayName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      await supabase.from("garmin_connections").delete().eq("user_id", user.id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'connect' or 'disconnect'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[garmin-auth] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
