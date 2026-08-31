import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildVertexAuth } from "../_shared/vertex-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const model = url.searchParams.get("model") || "gemini-flash-lite-latest";
  const location = url.searchParams.get("location") || Deno.env.get("GOOGLE_VERTEX_LOCATION") || "global";
  const project = Deno.env.get("GOOGLE_VERTEX_PROJECT_ID") || Deno.env.get("GOOGLE_CLOUD_PROJECT") || "inbound-isotope-500908-n8";
  const out: any = { model, location, project, hasSa: !!Deno.env.get("GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON"), hasApiKey: !!Deno.env.get("GOOGLE_VERTEX_API_KEY") };
  try {
    const base = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
    const { url: u, headers } = await buildVertexAuth(base, Deno.env.get("GOOGLE_VERTEX_API_KEY") || undefined);
    const t0 = Date.now();
    const res = await fetch(u, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: 'Return JSON array [{"week":1}] only.' }] }],
        generationConfig: { maxOutputTokens: 256, responseMimeType: "application/json", temperature: 0.7 },
      }),
    });
    out.status = res.status;
    out.ms = Date.now() - t0;
    out.body = (await res.text()).slice(0, 1500);
  } catch (e) {
    out.error = String(e);
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
