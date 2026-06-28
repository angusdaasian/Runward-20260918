// Debug: lists WA templates and tests sending each known template.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const PNID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const to = url.searchParams.get("to");

  // 1) find WABA id - try several paths
  const pnRes = await fetch(`https://graph.facebook.com/v21.0/${PNID}?fields=id,display_phone_number,verified_name,name_status,account_mode`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const pn = await pnRes.json();
  // Also try to walk up to WABA from the phone number node
  const pnParent = await fetch(`https://graph.facebook.com/v21.0/${PNID}?fields=whatsapp_business_account_id`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  (pn as any)._parent = await pnParent.json();
  const wabaQuery = url.searchParams.get("waba");
  let wabaId: string | null = wabaQuery ?? pn?.whatsapp_business_account?.id ?? null;
  if (!wabaId) {
    // Try debug_token to find owning WABA
    const dbg = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${TOKEN}&access_token=${TOKEN}`);
    const dbgJson = await dbg.json();
    wabaId = dbgJson?.data?.granular_scopes?.find?.((s: any) => s.scope === 'whatsapp_business_messaging')?.target_ids?.[0]
      ?? dbgJson?.data?.granular_scopes?.find?.((s: any) => s.scope === 'whatsapp_business_management')?.target_ids?.[0]
      ?? null;
    (pn as any)._debug_token = dbgJson;
  }
  // Fallback: use explicit business id from query param
  const bizParam = url.searchParams.get("biz");
  if (!wabaId && bizParam) {
    const wabas = await fetch(`https://graph.facebook.com/v21.0/${bizParam}/owned_whatsapp_business_accounts?fields=id,name`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const w = await wabas.json();
    (pn as any)._owned_wabas = w;
    wabaId = w?.data?.[0]?.id ?? null;
    if (!wabaId) {
      const cwabas = await fetch(`https://graph.facebook.com/v21.0/${bizParam}/client_whatsapp_business_accounts?fields=id,name`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      (pn as any)._client_wabas = await cwabas.json();
      wabaId = (pn as any)._client_wabas?.data?.[0]?.id ?? null;
    }
  }


  // 2) list templates
  let templates: any = null;
  if (wabaId) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=50&fields=name,language,status,category`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    templates = await r.json();
  }

  // 2b) list phone numbers in each known WABA to find which one owns ours
  const wabasToProbe = ["1706990044049795","1032120229389422","1541524263983057","3029079680617432"];
  const phoneOwnership: any[] = [];
  for (const w of wabasToProbe) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${w}/phone_numbers?fields=id,display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    phoneOwnership.push({ waba: w, body: await r.json() });
  }

  // 3) optionally test send each
  const tests: any[] = [];
  if (to) {
    const candidates = [
      { name: "daily_suggestion_en", lang: "en" },
      { name: "daily_suggestion_en", lang: "en_US" },
      { name: "daily_suggestion_cn", lang: "zh_HK" },
      { name: "daily_suggestion_cn", lang: "zh_CN" },
      { name: "daily_suggestion_cn", lang: "zh_TW" },
      { name: "activity_prompt_en", lang: "en" },
      { name: "activity_prompt_en", lang: "en_US" },
      { name: "activity_prompt_cn", lang: "zh_HK" },
      { name: "activity_prompt_cn", lang: "zh_CN" },
      { name: "activity_prompt_cn", lang: "zh_TW" },
      { name: "daily_suggestion", lang: "en" },
      { name: "daily_suggestion", lang: "en_US" },
      { name: "activity_prompt", lang: "en" },
      { name: "activity_prompt", lang: "en_US" },
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

  return new Response(JSON.stringify({ pn, wabaId, templates, phoneOwnership, tests }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
