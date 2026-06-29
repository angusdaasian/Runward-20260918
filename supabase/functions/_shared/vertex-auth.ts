// Shared Vertex AI auth helper for edge functions.
// Uses GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON to mint an OAuth2 access token.
// Falls back to API key (?key=) when service account is not configured.

let cachedToken: { token: string; expiresAtMs: number } | null = null;

function b64urlBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlText(text: string): string {
  return b64urlBytes(new TextEncoder().encode(text));
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function hasVertexServiceAccount(): boolean {
  return !!Deno.env.get("GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON");
}

export async function getVertexAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const json = Deno.env.get("GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON");
  if (!json) throw new Error("GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON is not configured");
  const sa = JSON.parse(json);
  const clientEmail = sa.client_email;
  const privateKey = sa.private_key;
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  if (!clientEmail || !privateKey) throw new Error("Invalid Vertex service account JSON");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${b64urlText(JSON.stringify(header))}.${b64urlText(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${b64urlBytes(new Uint8Array(sig))}`;

  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await resp.json().catch(() => ({} as any));
  if (!resp.ok || !body.access_token) {
    throw new Error(`Vertex service account auth failed (${resp.status}): ${JSON.stringify(body)}`);
  }
  cachedToken = {
    token: body.access_token,
    expiresAtMs: Date.now() + Math.max(Number(body.expires_in || 3600) - 60, 60) * 1000,
  };
  return cachedToken.token;
}

/**
 * Build URL + headers for a Vertex generateContent call.
 * Prefers OAuth bearer (service account) when available; falls back to API key.
 */
export async function buildVertexAuth(baseUrl: string, apiKey?: string): Promise<{ url: string; headers: Record<string, string> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (hasVertexServiceAccount()) {
    headers.Authorization = `Bearer ${await getVertexAccessToken()}`;
    return { url: baseUrl, headers };
  }
  if (apiKey) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    return { url: `${baseUrl}${sep}key=${encodeURIComponent(apiKey)}`, headers };
  }
  throw new Error("Vertex authentication is not configured");
}
