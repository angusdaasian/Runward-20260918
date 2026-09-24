// Receives sealed Stridee webhook deliveries (JWS-signed, JWE X25519 encrypted).
// Automatic sync: only Premium users whose auto_sync_enabled is on are ingested.
import { ingestStrideeWellness } from "../_shared/strideeWellness.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  base64url, compactDecrypt, createRemoteJWKSet, decodeProtectedHeader, flattenedVerify, importPKCS8,
} from "npm:jose@5.9.6";
import { ingestStrideeActivity, isPremium } from "../_shared/strideeIngest.ts";
import { triggerCrossPlatformDedup } from "../_shared/triggerDedup.ts";

const JWKS = createRemoteJWKSet(new URL("https://api.stridee.com/.well-known/jwks.json"));
let privKey: CryptoKey | null = null;
async function getKey() {
  if (!privKey) {
    const pem = (Deno.env.get("STRIDEE_ENC_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
    privKey = await importPKCS8(pem, "ECDH-ES") as CryptoKey;
  }
  return privKey;
}
const seen = new Set<string>();
const reply = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ ok: true });
  const raw = await req.text();
  // 1. Signature over raw bytes
  let ph: Record<string, unknown>;
  try {
    const [p, , sig] = (req.headers.get("webhook-signature") ?? "").split(".");
    const r = await flattenedVerify(
      { protected: p, signature: sig, payload: base64url.encode(new TextEncoder().encode(raw)) },
      JWKS, { algorithms: ["EdDSA"] },
    );
    ph = r.protectedHeader as Record<string, unknown>;
  } catch (e) {
    console.warn("[stridee-webhook] bad signature", e);
    return reply({ error: "bad signature" }, 401);
  }
  // 2. Freshness
  if (Math.abs(Date.now() / 1000 - Number(ph["webhook-timestamp"])) > 300) return reply({ error: "stale" }, 400);
  // 3. Decrypt
  let event: any;
  try {
    const { enc } = JSON.parse(raw);
    const { kid } = decodeProtectedHeader(enc);
    if (kid !== Deno.env.get("STRIDEE_ENC_KEY_ID")) console.warn("[stridee-webhook] unknown kid", kid);
    const { plaintext } = await compactDecrypt(enc, await getKey());
    event = JSON.parse(new TextDecoder().decode(plaintext));
  } catch (e) {
    console.error("[stridee-webhook] decrypt failed", e);
    return reply({ error: "decrypt failed" }, 400);
  }
  const deliveryId = String(ph["webhook-id"] ?? "");
  const ack = reply({ nonce: event.nonce });
  if (seen.has(deliveryId)) return ack;
  seen.add(deliveryId);
  console.log(`[stridee-webhook] ${event.type} user=${event.user_id} provider=${event.provider}`);

  if (event.type === "activity.created" && event.data) {
    const work = (async () => {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      let uid: string | null = event.data.external_user_id ?? event.external_user_id ?? null;
      const q = admin.from("stridee_connections").select("user_id, auto_sync_enabled");
      const { data: conn } = uid
        ? await q.eq("user_id", uid).maybeSingle()
        : await q.eq("stridee_user_id", event.user_id).maybeSingle();
      if (!conn) return console.warn("[stridee-webhook] no connection for", event.user_id);
      uid = conn.user_id;
      if (!conn.auto_sync_enabled || !(await isPremium(admin, uid!))) {
        return console.log("[stridee-webhook] auto sync off / not premium, skipped", uid);
      }
      await ingestStrideeActivity(admin, uid!, { ...event.data, received_at: event.created });
      await admin.from("stridee_connections").update({ last_synced_at: new Date().toISOString() }).eq("user_id", uid);
      triggerCrossPlatformDedup(uid!, 72);
    })().catch((e) => console.error("[stridee-webhook] ingest", e));
    // @ts-ignore EdgeRuntime exists on Supabase Edge
    try { EdgeRuntime.waitUntil(work); } catch { /* detached */ }
  }
  if ((event.type === "wellness.created" || event.type === "wellness.updated") && event.data) {
    const work = (async () => {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: conn } = await admin.from("stridee_connections").select("user_id").eq("stridee_user_id", event.user_id).maybeSingle();
      if (!conn) return console.warn("[stridee-webhook] wellness: no connection", event.user_id);
      await ingestStrideeWellness(admin, conn.user_id, { ...event.data, provider: event.data.provider ?? event.provider });
    })().catch((e) => console.error("[stridee-webhook] wellness", e));
    // @ts-ignore EdgeRuntime exists on Supabase Edge
    try { EdgeRuntime.waitUntil(work); } catch { /* detached */ }
  }
  return ack;
});
