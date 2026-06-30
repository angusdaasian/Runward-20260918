// Shared Vertex AI auth helper for edge functions.
// Uses GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON to mint an OAuth2 access token.
// Falls back to API key (?key=) when service account is not configured.

const cache = new Map<string, { token: string; expiresAtMs: number }>();

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

export function hasVertexServiceAccount(envVarName?: string): boolean {
  return !!Deno.env.get(envVarName || "GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON");
}

export async function getVertexAccessToken(envVarName?: string): Promise<string> {
  const key = envVarName || "GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON";
  const cached = cache.get(key);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) {
    return cached.token;
  }
  const json = Deno.env.get(key);
  if (!json) throw new Error(`${key} is not configured`);
  const sa = JSON.parse(json);
  const clientEmail = sa.client_email;
  const privateKey = sa.private_key;
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  if (!clientEmail || !privateKey) throw new Error(`Invalid Vertex service account JSON in ${key}`);

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
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
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
  const entry = {
    token: body.access_token,
    expiresAtMs: Date.now() + Math.max(Number(body.expires_in || 3600) - 60, 60) * 1000,
  };
  cache.set(key, entry);
  return entry.token;
}

/**
 * Build URL + headers for a Vertex generateContent call.
 * Prefers OAuth bearer (service account) when available; falls back to API key.
 */
export async function buildVertexAuth(baseUrl: string, apiKey?: string): Promise<{ url: string; headers: Record<string, string> }> {
  return buildVertexAuthForEnv(baseUrl, "GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON", apiKey);
}

export async function buildVertexAuthForEnv(
  baseUrl: string,
  envVarName: string,
  apiKey?: string,
): Promise<{ url: string; headers: Record<string, string> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (hasVertexServiceAccount(envVarName)) {
    headers.Authorization = `Bearer ${await getVertexAccessToken(envVarName)}`;
    return { url: baseUrl, headers };
  }
  if (apiKey) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    return { url: `${baseUrl}${sep}key=${encodeURIComponent(apiKey)}`, headers };
  }
  throw new Error("Vertex authentication is not configured");
}

/**
 * Upload bytes to a GCS object using the service account token.
 * Uses simple upload for files <= 5MB; resumable otherwise.
 */
export async function uploadToGcs(
  bucket: string,
  objectName: string,
  content: Uint8Array,
  contentType = "application/octet-stream",
  envVarName?: string,
): Promise<{ uri: string; size: number }> {
  const token = await getVertexAccessToken(envVarName || "GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON");
  const encodedName = encodeURIComponent(objectName);
  const size = content.length;

  if (size <= 5 * 1024 * 1024) {
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodedName}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      body: content,
    });
    const body = await resp.json().catch(() => ({} as any));
    if (!resp.ok) {
      throw new Error(`GCS upload failed (${resp.status}): ${JSON.stringify(body)}`);
    }
    return { uri: `gs://${bucket}/${objectName}`, size };
  }

  // Resumable upload for larger files
  const initUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=resumable&name=${encodedName}`;
  const initResp = await fetch(initUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": contentType, "X-Upload-Content-Length": String(size) },
    body: JSON.stringify({ name: objectName, contentType }),
  });
  if (!initResp.ok) {
    const body = await initResp.json().catch(() => ({} as any));
    throw new Error(`GCS resumable init failed (${initResp.status}): ${JSON.stringify(body)}`);
  }
  const sessionUrl = initResp.headers.get("Location");
  if (!sessionUrl) throw new Error("GCS resumable upload did not return a Location header");

  const uploadResp = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(size) },
    body: content,
  });
  const body = await uploadResp.json().catch(() => ({} as any));
  if (!uploadResp.ok) {
    throw new Error(`GCS resumable upload failed (${uploadResp.status}): ${JSON.stringify(body)}`);
  }
  return { uri: `gs://${bucket}/${objectName}`, size };
}
