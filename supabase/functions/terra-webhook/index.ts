import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, terra-signature",
};

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function verifySignature(secret: string, header: string | null, raw: string): Promise<boolean> {
  if (!header) return false;
  // header format: "t=<timestamp>,v1=<signature>"
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const payload = `${t}.${raw}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

function mapProvider(resource: string | undefined | null): string {
  return (resource ?? "").toUpperCase();
}

async function findUserId(terraUserId: string | null, referenceId: string | null): Promise<string | null> {
  if (referenceId) return referenceId;
  if (!terraUserId) return null;
  const { data } = await supa.from("terra_connections").select("user_id").eq("terra_user_id", terraUserId).maybeSingle();
  return data?.user_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const raw = await req.text();
  const sigHeader = req.headers.get("terra-signature");
  const secret = Deno.env.get("TERRA_SIGNING_SECRET") ?? "";
  let signatureValid = false;
  try { signatureValid = secret ? await verifySignature(secret, sigHeader, raw) : false; } catch { signatureValid = false; }

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { payload = { _parse_error: true, raw }; }

  const type: string = payload?.type ?? "unknown";
  const user = payload?.user ?? {};
  const terraUserId: string | null = user?.user_id ?? null;
  const referenceId: string | null = user?.reference_id ?? null;
  const provider: string = mapProvider(user?.provider ?? payload?.resource);

  let processingError: string | null = null;
  try {
    if (!signatureValid && secret) {
      processingError = "invalid signature";
    } else {
      const appUserId = await findUserId(terraUserId, referenceId);

      if (type === "auth" && appUserId && terraUserId) {
        await supa.from("terra_connections").upsert({
          user_id: appUserId,
          terra_user_id: terraUserId,
          provider,
          reference_id: referenceId,
          scopes: user?.scopes ?? null,
          active: true,
          last_webhook_at: new Date().toISOString(),
        }, { onConflict: "user_id,provider" });
      } else if ((type === "deauth" || type === "access_revoked") && terraUserId) {
        await supa.from("terra_connections").update({ active: false, last_webhook_at: new Date().toISOString() }).eq("terra_user_id", terraUserId);
      } else if ((type === "activity" || type === "processed_activity") && appUserId) {
        const acts = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        for (const a of acts) {
          const meta = a?.metadata ?? {};
          const dist = a?.distance_data?.summary ?? {};
          const hr = a?.heart_rate_data?.summary ?? {};
          const cal = a?.calories_data ?? {};
          const elev = a?.distance_data?.summary?.elevation ?? {};
          const aid = String(meta?.upload_type ?? "") + ":" + String(meta?.summary_id ?? meta?.id ?? meta?.start_time ?? crypto.randomUUID());
          await supa.from("terra_activities").upsert({
            user_id: appUserId,
            provider,
            terra_activity_id: aid,
            activity_name: meta?.name ?? null,
            activity_type: meta?.type ?? meta?.activity_type ?? null,
            start_time: meta?.start_time ?? null,
            duration_seconds: meta?.active_duration_seconds ? Math.round(meta.active_duration_seconds) : null,
            distance_meters: dist?.distance_meters ?? null,
            calories: cal?.total_burned_calories ? Math.round(cal.total_burned_calories) : null,
            average_hr: hr?.avg_hr_bpm ? Math.round(hr.avg_hr_bpm) : null,
            max_hr: hr?.max_hr_bpm ? Math.round(hr.max_hr_bpm) : null,
            elevation_gain: elev?.gain_actual_meters ?? null,
            average_speed: a?.movement_data?.avg_speed_meters_per_second ?? null,
            raw_json: a,
          }, { onConflict: "user_id,terra_activity_id" });
        }
      } else if (type === "daily" && appUserId) {
        const items = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        for (const d of items) {
          const meta = d?.metadata ?? {};
          const date = (meta?.start_time ?? "").slice(0, 10) || (meta?.end_time ?? "").slice(0, 10);
          if (!date) continue;
          await supa.from("terra_daily_health").upsert({
            user_id: appUserId,
            provider,
            date,
            resting_hr: d?.heart_rate_data?.summary?.resting_hr_bpm ?? null,
            steps: d?.distance_data?.steps ?? null,
            vo2max: d?.MET_data?.avg_level ?? null,
          }, { onConflict: "user_id,provider,date" });
        }
      } else if (type === "sleep" && appUserId) {
        const items = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        for (const s of items) {
          const meta = s?.metadata ?? {};
          const date = (meta?.start_time ?? "").slice(0, 10);
          if (!date) continue;
          await supa.from("terra_daily_health").upsert({
            user_id: appUserId,
            provider,
            date,
            sleep_seconds: s?.sleep_durations_data?.asleep?.duration_asleep_state_seconds ?? null,
            sleep_score: s?.sleep_durations_data?.sleep_efficiency ?? null,
          }, { onConflict: "user_id,provider,date" });
        }
      }
    }
  } catch (e) {
    processingError = String(e);
    console.error("terra-webhook processing error", e);
  }

  await supa.from("terra_webhook_events").insert({
    type,
    terra_user_id: terraUserId,
    reference_id: referenceId,
    signature_valid: signatureValid,
    payload,
    processing_error: processingError,
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
