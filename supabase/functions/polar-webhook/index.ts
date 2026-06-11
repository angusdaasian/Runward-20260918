import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { POLAR_API_BASE, exerciseRow, PolarExercise } from "../_shared/polar.ts";

// Polar AccessLink webhook receiver.
// - PING events sent on webhook creation
// - EXERCISE events sent on new exercise
// Polar signs body with HMAC-SHA256 using the secret returned at webhook creation,
// in header `Polar-Webhook-Signature` (lowercase hex).
// Docs: https://www.polar.com/accesslink-api/#webhooks

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, polar-webhook-signature",
};

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE);

    const raw = await req.text();
    const sig = req.headers.get("Polar-Webhook-Signature")
      ?? req.headers.get("polar-webhook-signature");

    // Look up the active webhook secret (we only ever register one)
    const { data: hook } = await supabase
      .from("polar_webhooks")
      .select("signature_secret")
      .limit(1)
      .maybeSingle();

    if (!hook?.signature_secret) {
      console.error("[polar-webhook] no webhook registered");
      return new Response(JSON.stringify({ error: "no webhook" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (sig) {
      const expected = await hmacSha256Hex(hook.signature_secret, raw);
      if (expected.toLowerCase() !== sig.toLowerCase()) {
        console.error("[polar-webhook] signature mismatch");
        return new Response(JSON.stringify({ error: "bad signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("[polar-webhook] no signature header — accepting anyway (PING?)");
    }

    let payload: any = {};
    try { payload = JSON.parse(raw); } catch { /* PING may be empty */ }

    console.log("[polar-webhook] event", payload?.event, "user", payload?.user_id);

    if (payload?.event === "PING") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload?.event === "EXERCISE") {
      const polarUserId = Number(payload.user_id);
      const exerciseUrl: string | undefined = payload.url;

      // Find our user
      const { data: conn } = await supabase
        .from("polar_connections")
        .select("user_id, access_token, polar_user_id")
        .eq("polar_user_id", polarUserId)
        .maybeSingle();

      if (!conn) {
        console.warn("[polar-webhook] no connection for polar_user_id", polarUserId);
        // Still 200 so Polar doesn't retry forever
        return new Response(JSON.stringify({ ok: true, note: "unknown user" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const headers = {
        "Authorization": `Bearer ${conn.access_token}`,
        "Accept": "application/json",
      };

      // Webhook delivers the exercise URL — but data is still inside a transaction.
      // We need to open a transaction, fetch the exercise, commit.
      try {
        const txRes = await fetch(
          `${POLAR_API_BASE}/users/${polarUserId}/exercise-transactions`,
          { method: "POST", headers },
        );

        let urls: string[] = exerciseUrl ? [exerciseUrl] : [];
        let txId: number | string | null = null;

        if (txRes.ok) {
          const txData = await txRes.json();
          txId = txData["transaction-id"] ?? txData.transactionId ?? null;
          if (txId) {
            const listRes = await fetch(
              `${POLAR_API_BASE}/users/${polarUserId}/exercise-transactions/${txId}`,
              { headers },
            );
            if (listRes.ok) {
              const listData = await listRes.json();
              if (Array.isArray(listData.exercises) && listData.exercises.length) {
                urls = listData.exercises;
              }
            }
          }
        } else if (txRes.status !== 204) {
          console.warn("[polar-webhook] tx open failed", txRes.status, await txRes.text());
        }

        for (const url of urls) {
          const exRes = await fetch(url, { headers });
          if (!exRes.ok) {
            console.warn("[polar-webhook] exercise fetch failed", url, exRes.status);
            continue;
          }
          const ex = await exRes.json() as PolarExercise;
          await supabase.from("polar_activities")
            .upsert(exerciseRow(conn.user_id, ex), { onConflict: "polar_exercise_id" });
        }

        if (txId) {
          await fetch(
            `${POLAR_API_BASE}/users/${polarUserId}/exercise-transactions/${txId}`,
            { method: "PUT", headers },
          ).catch((e) => console.warn("[polar-webhook] commit failed", e));
        }
      } catch (e) {
        console.error("[polar-webhook] pull error", e);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: payload?.event ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("polar-webhook error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
