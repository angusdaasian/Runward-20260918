import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_USER_ID = "c7a7d1ca-c7bf-4288-bb9d-794006a04087";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, name } = await req.json().catch(() => ({}));
    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!appId || !apiKey) {
      return new Response(JSON.stringify({ error: "OneSignal not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const heading = "📩 New Feedback Received";
    const content = `${name || "Someone"}: ${title || "(no title)"}`.slice(0, 200);

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${apiKey}` },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [ADMIN_USER_ID],
        headings: { en: heading },
        contents: { en: content },
        data: { type: "admin_feedback" },
      }),
    });
    const result = await res.json();
    console.log("[notify-admin-feedback]", JSON.stringify(result));
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-admin-feedback error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
