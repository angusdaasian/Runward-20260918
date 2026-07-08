// Debug: reproduces the daily WhatsApp send end-to-end and returns
// the exact outgoing payload + Meta accept response + any error body inline.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const PNID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const GRAPH = "v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: users } = await supabase
    .from("profiles")
    .select("user_id, whatsapp_wa_id, lang")
    .eq("whatsapp_daily_workout", true)
    .not("whatsapp_wa_id", "is", null);

  const out: any[] = [];

  for (const u of users ?? []) {
    const lang = String(u.lang ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
    const today = new Date().toISOString().slice(0, 10);

    const genRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-suggested-workout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "x-internal-secret": SERVICE_KEY,
      },
      body: JSON.stringify({
        internalUserId: u.user_id,
        lang, todayDate: today, workoutType: "auto", simple: true,
      }),
    });
    const genBody = await genRes.text();
    let suggestion = "";
    try { suggestion = JSON.parse(genBody)?.suggestion ?? ""; } catch {}
    const rawSuggestion = suggestion;
    suggestion = suggestion.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
    if (suggestion.length > 700) suggestion = suggestion.slice(0, 697) + "...";

    const templateName = lang === "zh" ? "daily_suggestion_cn" : "daily_suggestion_en";
    const langCode = lang === "zh" ? "zh_HK" : "en";

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: u.whatsapp_wa_id,
      type: "template",
      template: {
        name: templateName,
        language: { code: langCode },
        components: [{ type: "body", parameters: [{ type: "text", text: suggestion || "—" }] }],
      },
    };

    const sendRes = await fetch(`https://graph.facebook.com/${GRAPH}/${PNID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(payload),
    });
    const sendBody = await sendRes.text();

    out.push({
      user_id: u.user_id,
      wa_id: u.whatsapp_wa_id,
      lang, templateName, langCode,
      genStatus: genRes.status,
      genBodyPreview: genBody.slice(0, 300),
      rawSuggestionLen: rawSuggestion.length,
      rawSuggestionPreview: rawSuggestion.slice(0, 300),
      sanitizedSuggestion: suggestion,
      sanitizedLen: suggestion.length,
      sendStatus: sendRes.status,
      sendBody: (() => { try { return JSON.parse(sendBody); } catch { return sendBody; } })(),
      payload,
    });
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
