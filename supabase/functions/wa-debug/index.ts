import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const PHONE = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const GRAPH = "v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "send";
  const to = url.searchParams.get("to") ?? "85291588020";
  const template = url.searchParams.get("template") ?? "daily_suggestion_en";
  const lang = url.searchParams.get("lang") ?? "en";

  if (action === "list") {
    const phoneRes = await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE}?fields=display_phone_number,verified_name,quality_rating,name_status`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const phoneData = await phoneRes.json();
    const wabaId = url.searchParams.get("waba");
    let templates: any = null;
    if (wabaId) {
      const tplRes = await fetch(`https://graph.facebook.com/${GRAPH}/${wabaId}/message_templates?fields=name,status,language,category&limit=200`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      templates = await tplRes.json();
    }
    return json({ phoneData, templates, hint: "pass ?waba=<id> to list templates" });
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [{ type: "body", parameters: [{ type: "text", text: "Debug test message from Runward at " + new Date().toISOString() }] }],
      },
    }),
  });
  const body = await res.text();
  return json({ status: res.status, body: safeParse(body) });
});

function json(o: any) {
  return new Response(JSON.stringify(o, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function safeParse(s: string) { try { return JSON.parse(s); } catch { return s; } }
