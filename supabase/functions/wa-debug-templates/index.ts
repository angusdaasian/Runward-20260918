// Debug: lists WA templates and tests sending each known template.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const PNID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const to = url.searchParams.get("to");

  // 1) find WABA id - try several paths
  const pnRes = await fetch(`https://graph.facebook.com/v21.0/${PNID}?fields=id,display_phone_number`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const pn = await pnRes.json();
  const wabaQuery = url.searchParams.get("waba");
  let wabaId = wabaQuery;
  if (!wabaId) {
    // Try debug_token to find owning WABA
    const dbg = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${TOKEN}&access_token=${TOKEN}`);
    const dbgJson = await dbg.json();
    wabaId = dbgJson?.data?.granular_scopes?.find?.((s: any) => s.scope === 'whatsapp_business_messaging')?.target_ids?.[0]
      ?? dbgJson?.data?.granular_scopes?.find?.((s: any) => s.scope === 'whatsapp_business_management')?.target_ids?.[0]
      ?? null;
    (pn as any)._debug_token = dbgJson;
  }
  // Fallback: list businesses
  if (!wabaId) {
    const me = await fetch(`https://graph.facebook.com/v21.0/me/businesses?fields=id,name`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const meJson = await me.json();
    (pn as any)._me_biz = meJson;
    const bizId = meJson?.data?.[0]?.id;
    if (bizId) {
      const wabas = await fetch(`https://graph.facebook.com/v21.0/${bizId}/owned_whatsapp_business_accounts?fields=id,name`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      const w = await wabas.json();
      (pn as any)._wabas = w;
      wabaId = w?.data?.[0]?.id ?? null;
    }

  // 2) list templates
  let templates: any = null;
  if (wabaId) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=50&fields=name,language,status,category`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    templates = await r.json();
  }

  // 3) optionally test send each
  const tests: any[] = [];
  if (to) {
    const candidates = [
      { name: "daily_suggestion_en", lang: "en" },
      { name: "daily_suggestion_cn", lang: "zh_HK" },
      { name: "activity_prompt_en", lang: "en" },
      { name: "activity_prompt_cn", lang: "zh_HK" },
    ];
    for (const c of candidates) {
      const r = await fetch(`https://graph.facebook.com/v21.0/${PNID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", to, type: "template",
          template: { name: c.name, language: { code: c.lang },
            components: [{ type: "body", parameters: [{ type: "text", text: "debug ping" }] }] },
        }),
      });
      tests.push({ template: c.name, lang: c.lang, status: r.status, body: await r.text() });
    }
  }

  return new Response(JSON.stringify({ pn, wabaId, templates, tests }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
