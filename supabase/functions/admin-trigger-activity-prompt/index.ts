// Admin one-off: manually trigger telegram/whatsapp activity prompt for a given user+activity.
import { maybeSendTelegramActivityPrompt } from "../_shared/telegramActivityPrompt.ts";
import { maybeSendWhatsappActivityPrompt } from "../_shared/whatsappActivityPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { userId, source, activityKey, distanceMeters, durationSeconds, sportType, channel } = body;
    if (!userId || !source || !activityKey) {
      return new Response(JSON.stringify({ error: "missing userId/source/activityKey" }), { status: 400, headers: corsHeaders });
    }
    const summary = { userId, source, activityKey, distanceMeters, durationSeconds, sportType: sportType ?? "running" };
    const results: any = {};
    if (!channel || channel === "telegram") {
      await maybeSendTelegramActivityPrompt(summary);
      results.telegram = "invoked";
    }
    if (!channel || channel === "whatsapp") {
      await maybeSendWhatsappActivityPrompt(summary);
      results.whatsapp = "invoked";
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
