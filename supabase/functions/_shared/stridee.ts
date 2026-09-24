// Stridee Platform client — RFC 9421 Ed25519 request signing.
// Secrets: STRIDEE_KEY_ID (console key id), STRIDEE_PRIVATE_KEY (Ed25519 PEM).
import { createHash, createPrivateKey, randomBytes, sign } from "node:crypto";

export const STRIDEE_BASE = "https://api.stridee.com";

function loadKey() {
  const raw = Deno.env.get("STRIDEE_PRIVATE_KEY") ?? "";
  const keyId = Deno.env.get("STRIDEE_KEY_ID") ?? "";
  if (!raw || !keyId) throw new Error("Stridee secrets not configured");
  // Accept PEM pasted with lost newlines, or a bare base64 body / 32-byte seed.
  const b64 = raw.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  let der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (der.length === 32) {
    const prefix = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
    der = new Uint8Array([...prefix, ...der]);
  }
  const body = btoa(String.fromCharCode(...der)).match(/.{1,64}/g)!.join("\n");
  const pem = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
  return { key: createPrivateKey(pem), keyId };
}

export async function strideeFetch(
  method: string,
  pathAndQuery: string,
  body?: unknown,
  opts: { redirect?: RequestRedirect } = {},
): Promise<Response> {
  const { key, keyId } = loadKey();
  const url = `${STRIDEE_BASE}${pathAndQuery}`;
  const bodyStr = body === undefined ? undefined : JSON.stringify(body);
  const created = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("base64url");
  const components = ['"@method"', '"@target-uri"'];
  const lines = [`"@method": ${method.toUpperCase()}`, `"@target-uri": ${url}`];
  const headers: Record<string, string> = {};
  if (bodyStr !== undefined) {
    const digest = `sha-256=:${createHash("sha256").update(bodyStr).digest("base64")}:`;
    headers["Content-Digest"] = digest;
    headers["Content-Type"] = "application/json";
    components.push('"content-digest"');
    lines.push(`"content-digest": ${digest}`);
  }
  const params = `(${components.join(" ")});created=${created};keyid="${keyId}";nonce="${nonce}";alg="ed25519"`;
  const base = `${lines.join("\n")}\n"@signature-params": ${params}`;
  const sig = sign(null, new TextEncoder().encode(base), key).toString("base64");
  headers["Signature-Input"] = `sig1=${params}`;
  headers["Signature"] = `sig1=:${sig}:`;
  return fetch(url, { method, headers, body: bodyStr, redirect: opts.redirect ?? "follow" });
}
