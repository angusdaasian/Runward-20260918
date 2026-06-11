// Meta WhatsApp Cloud API webhook.
// Handles:
//  - GET  : verification handshake (hub.mode=subscribe, hub.verify_token, hub.challenge)
//  - POST : incoming messages / status callbacks (logged for now; full handling added later)
//
// verify_jwt is intentionally off for this function (Meta calls it unauthenticated).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // --- Meta verification handshake ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log("[whatsapp-webhook] GET verify", {
      mode,
      tokenMatch: token === VERIFY_TOKEN,
      hasChallenge: !!challenge,
    });

    if (mode === "subscribe" && token && token === VERIFY_TOKEN && challenge) {
      // Meta expects the raw challenge string back, 200 OK, text/plain.
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response("forbidden", { status: 403 });
  }

  // --- Inbound events (messages / statuses) ---
  if (req.method === "POST") {
    let body: unknown = null;
    try {
      body = await req.json();
    } catch (_) {
      body = null;
    }
    console.log("[whatsapp-webhook] POST event", JSON.stringify(body));

    // TODO (next phase): signature check via X-Hub-Signature-256 + WHATSAPP_APP_SECRET,
    // then route to linking / RPE / AI-coach handlers (mirroring telegram-webhook).
    // Always ack 200 quickly so Meta does not retry.
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("method not allowed", { status: 405 });
});
