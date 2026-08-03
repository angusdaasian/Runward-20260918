import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { buildVertexAuth } from "../_shared/vertex-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getVertexProjectId(): string {
  return Deno.env.get("GOOGLE_VERTEX_PROJECT_ID")
    || Deno.env.get("GOOGLE_CLOUD_PROJECT")
    || Deno.env.get("GCLOUD_PROJECT")
    || "inbound-isotope-500908-n8";
}

function getVertexLocation(): string {
  return Deno.env.get("GOOGLE_VERTEX_LOCATION") || "global";
}

async function callVertexAI(opts: { apiKey: string; model?: string; messages: Array<{ role: string; content: any }> }): Promise<Response> {
  const VERTEX_MODEL_MAP: Record<string, string> = {
    "google/gemini-3.1-flash-lite-preview": "gemini-flash-lite-latest",
    "google/gemini-3-flash-preview": "gemini-flash-lite-latest",
  };
  const model = VERTEX_MODEL_MAP[opts.model || ""] || (opts.model || "gemini-flash-lite-latest").replace(/^google\//, "");
  const __baseUrl = `https://aiplatform.googleapis.com/v1/projects/${getVertexProjectId()}/locations/${getVertexLocation()}/publishers/google/models/${model}:generateContent`;
  const { url, headers: __vxHeaders } = await buildVertexAuth(__baseUrl, opts.apiKey);
  const systemParts: any[] = [];
  const contents: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") { systemParts.push({ text: typeof m.content === "string" ? m.content : "" }); continue; }
    const role = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: typeof m.content === "string" ? m.content : String(m.content) }] });
  }
  const body: any = { contents };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  const vRes = await fetch(url, { method: "POST", headers: __vxHeaders, body: JSON.stringify(body) });
  if (!vRes.ok) return new Response(await vRes.text(), { status: vRes.status });
  const vData = await vRes.json();
  const text = vData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200, headers: __vxHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require authenticated user
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: claimsData, error: claimsErr } = await sb.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { name, race_date, place, category } = await req.json();

    if (!name || !race_date || !place || !category) {
      return new Response(JSON.stringify({ error: "All fields are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY");
    if (!VERTEX_API_KEY) throw new Error("GOOGLE_VERTEX_API_KEY not configured");

    const prompt = `Verify if the following is a real, official running race event:

Race Name: ${name}
Date: ${race_date}
Place: ${place}
Category: ${category}

Is this a real, officially organized running race? Answer with a JSON object:
{
  "verified": true or false,
  "confidence": "high" / "medium" / "low",
  "reason": "brief explanation",
  "city": "the city name",
  "country": "the country name"
}

If you recognize this as a well-known or officially registered race, set verified to true.
If you cannot confirm it exists or it seems made up, set verified to false.
Extract the city and country from the place provided.
Return ONLY the JSON object.`;

    const res = await callVertexAI({
      apiKey: VERTEX_API_KEY,
      model: "google/gemini-3.1-flash-lite-preview",
      messages: [
        { role: "system", content: "You are a running race verification assistant. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI call failed: ${res.status} ${t}`);
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) content = jsonMatch[1].trim();

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      result = { verified: false, confidence: "low", reason: "Could not parse AI response" };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-race error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
