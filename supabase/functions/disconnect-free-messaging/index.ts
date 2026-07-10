// Disconnects WhatsApp/Telegram messaging for all NON-premium users.
// Intended to run daily via pg_cron starting on/after the beta cutoff date.
// No-ops before the cutoff so it's safe to schedule immediately.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

// Beta ends 2026-07-17 23:59:59 UTC. Change here if you want to extend.
const BETA_CUTOFF_ISO = "2026-07-17T23:59:59Z";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const now = new Date();
  const cutoff = new Date(BETA_CUTOFF_ISO);
  if (now < cutoff) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "beta_active", cutoff: BETA_CUTOFF_ISO }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Find non-premium users with any active messaging linkage
  const { data: rows, error: selErr } = await supabase
    .from("profiles")
    .select("user_id, telegram_chat_id, whatsapp_wa_id, is_premium")
    .eq("is_premium", false)
    .or("telegram_chat_id.not.is.null,whatsapp_wa_id.not.is.null");

  if (selErr) {
    console.error("[disconnect-free-messaging] select error:", selErr);
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targets = rows ?? [];
  if (!targets.length) {
    return new Response(JSON.stringify({ ok: true, disconnected: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userIds = targets.map((r) => r.user_id as string);
  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      telegram_chat_id: null,
      telegram_daily_workout: false,
      telegram_activity_feedback: false,
      telegram_link_code: null,
      telegram_link_code_expires_at: null,
      whatsapp_wa_id: null,
      whatsapp_phone_e164: null,
      whatsapp_daily_workout: false,
      whatsapp_activity_feedback: false,
      whatsapp_link_code: null,
      whatsapp_link_code_expires_at: null,
    } as any)
    .in("user_id", userIds);

  if (updErr) {
    console.error("[disconnect-free-messaging] update error:", updErr);
    return new Response(JSON.stringify({ error: updErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[disconnect-free-messaging] disconnected ${userIds.length} free users`);
  return new Response(
    JSON.stringify({ ok: true, disconnected: userIds.length, cutoff: BETA_CUTOFF_ISO }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
