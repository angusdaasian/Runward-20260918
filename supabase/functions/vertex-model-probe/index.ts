import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildVertexAuth } from "../_shared/vertex-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CANDIDATES = [
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const project = Deno.env.get("GOOGLE_VERTEX_PROJECT_ID") || "inbound-isotope-500908-n8";
  const location = Deno.env.get("GOOGLE_VERTEX_LOCATION") || "global";
  const apiKey = Deno.env.get("GOOGLE_VERTEX_API_KEY") || "";
  const out: Record<string, string> = {};
  for (const m of CANDIDATES) {
    const base = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${m}:generateContent`;
    try {
      const { url, headers } = await buildVertexAuth(base, apiKey);
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 8 } }),
      });
      const t = await res.text();
      out[m] = res.ok ? "OK" : `${res.status}: ${t.slice(0, 120)}`;
    } catch (e) {
      out[m] = `ERR ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
