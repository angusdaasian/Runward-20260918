// Receives sealed Stridee webhook deliveries (JWS-signed, JWE X25519 encrypted).
// Automatic sync: all connected users with auto_sync_enabled on are ingested (default on).
import { ingestStrideeWellness } from "../_shared/strideeWellness.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  base64url, compactDecrypt, createRemoteJWKSet, decodeProtectedHeader, flattenedVerify, importPKCS8,
} from "npm:jose@5.9.6";
import { ingestStrideeActivity, isPremium } from "../_shared/strideeIngest.ts";
import { triggerCrossPlatformDedup } from "../_shared/triggerDedup.ts";
import { maybeTrainCoachOnce } from "../_shared/trainCoachOnce.ts";
import { maybeSendTelegramActivityPrompt } from "../_shared/telegramActivityPrompt.ts";
import { maybeSendWhatsappActivityPrompt } from "../_shared/whatsappActivityPrompt.ts";
import { getAppLanguage } from "../_shared/appLanguage.ts";

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

// New-run alerts: one push + Telegram/WhatsApp RPE prompt per activity (only recent ones).
async function notifyNewActivity(admin: any, uid: string, strideeId: string) {
  try {
    const { data: act } = await admin.from("terra_activities")
      .select("activity_type, activity_name, distance_meters, duration_seconds, start_time")
      .eq("user_id", uid).eq("terra_activity_id", `stridee_${strideeId}`).maybeSingle();
    if (!act || !(Number(act.distance_meters) > 0)) return;
    if (act.start_time && Date.now() - new Date(act.start_time).getTime() > 48 * 3600e3) return;
    const { data: claim } = await admin.from("activity_push_log")
      .insert({ user_id: uid, activity_key: `stridee:${strideeId}` }).select("id").maybeSingle();
    if (!claim) return;
    const { data: profile } = await admin.from("profiles")
      .select("activity_notifications, lang").eq("user_id", uid).maybeSingle();
    const appId = Deno.env.get("ONESIGNAL_APP_ID"), apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (profile?.activity_notifications && appId && apiKey) {
      const zh = await getAppLanguage(admin, uid, profile?.lang) === "zh";
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${apiKey}` },
        body: JSON.stringify({
          app_id: appId, include_external_user_ids: [uid],
          headings: { en: zh ? "新活動已同步" : "New activity synced" },
          contents: { en: zh ? "你的最新活動已上傳。" : "Your latest activity has been uploaded." },
        }),
      });
      console.log(`[stridee-webhook] push ${res.status}`);
    }
    const t = `${act.activity_type ?? ""} ${act.activity_name ?? ""}`.toLowerCase();
    if (/run|jog|trail|treadmill|跑/.test(t)) {
      const prompt = {
        userId: uid, source: "terra" as const, activityKey: `stridee_${strideeId}`,
        distanceMeters: Number(act.distance_meters) || null,
        durationSeconds: Number(act.duration_seconds) || null, sportType: "run",
      };
      await maybeSendTelegramActivityPrompt(prompt);
      await maybeSendWhatsappActivityPrompt(prompt);
    }
  } catch (e) { console.error("[stridee-webhook] notify", e); }
}
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
      if (!conn.auto_sync_enabled) {
        return console.log("[stridee-webhook] auto sync off, skipped", uid);
      }
      // Free accounts keep the last 30 days only; history replays arrive as
      // activity.created events, so enforce the cap here too.
      const startMs = Date.parse(event.data.start_time ?? "");
      if (Number.isFinite(startMs) && Date.now() - startMs > 30 * 86400_000) {
        const premium = await isPremium(admin, uid!);
        if (!premium) return console.log("[stridee-webhook] old activity skipped (free tier)", uid, event.data.id);
      }
      await ingestStrideeActivity(admin, uid!, { ...event.data, received_at: event.created });
      await maybeTrainCoachOnce(admin, uid!);
      await admin.from("stridee_connections").update({ last_synced_at: new Date().toISOString() }).eq("user_id", uid);
      triggerCrossPlatformDedup(uid!, 72);
      await notifyNewActivity(admin, uid!, String(event.data.id));
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
