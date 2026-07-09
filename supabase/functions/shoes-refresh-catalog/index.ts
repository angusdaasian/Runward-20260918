// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildVertexAuth, getVertexLocation, getVertexProjectId } from "../_shared/vertex-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = ["daily", "easy", "tempo", "interval", "race", "trail", "recovery"] as const;

const DEFAULT_BRANDS = [
  "Nike", "Adidas", "Puma", "New Balance", "Saucony", "On", "Topo Athletic",
  "Asics", "Salomon", "Hoka", "The North Face", "Xtep", "Anta", "Li-Ning",
  "Bmai", "Dynafit", "Mizuno", "Brooks", "361 Degrees", "Altra", "Merrell",
  "Craft", "Under Armour", "Reebok", "Skechers", "Kailas", "Norda", "Speedland",
];

async function callGemini(apiKey: string, prompt: string, timeoutMs = 120_000): Promise<string> {
  const model = "gemini-3.1-pro-preview";
  const baseUrl = `https://aiplatform.googleapis.com/v1/projects/${getVertexProjectId()}/locations/${getVertexLocation()}/publishers/google/models/${model}:generateContent`;
  const { url, headers } = await buildVertexAuth(baseUrl, apiKey);
  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingLevel: "low" },
      responseMimeType: "application/json",
    },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`vertex ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  } finally {
    clearTimeout(timer);
  }
}

function safeParseJson(text: string): any[] {
  // Strip markdown fences if present
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.shoes)) return parsed.shoes;
    return [];
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY")!;
    if (!SUPABASE_URL || !SERVICE_KEY || !VERTEX_API_KEY) {
      return new Response(JSON.stringify({ error: "not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const brands: string[] = Array.isArray(body?.brands) && body.brands.length ? body.brands : DEFAULT_BRANDS;
    const modelsPerBrand: number = Math.min(Math.max(Number(body?.modelsPerBrand) || 6, 3), 12);

    // Admin/cron gate: allow either service-role internal secret or admin user
    const internalSecret = req.headers.get("x-internal-secret");
    if (internalSecret !== SERVICE_KEY) {
      const auth = req.headers.get("Authorization");
      if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      const { data: userResp, error: uErr } = await svc.auth.getUser(token);
      if (uErr || !userResp?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      const { data: role } = await svc.from("user_roles").select("role").eq("user_id", userResp.user.id).eq("role", "admin").maybeSingle();
      if (!role) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const prompt = `You are a running-shoe catalog builder. For each brand below, list up to ${modelsPerBrand} of the LATEST (2024-2026) running shoe models actively sold. Cover the whole training spectrum where possible: daily trainers, easy runs, tempo/uptempo, intervals/speedwork, race-day carbon plated, trail, and recovery/max-cushion.

Brands: ${brands.join(", ")}

Return a JSON array only. Each item:
{
  "brand": "Nike",
  "model": "Vaporfly 3",
  "category": "race",        // one of: daily, easy, tempo, interval, race, trail, recovery
  "year": 2024,
  "description": "Carbon-plated racing shoe with ZoomX foam; marathon PR shoe."
}

Rules:
- Use the official brand name spelling (e.g. "Li-Ning", "New Balance", "Hoka", "Topo Athletic", "361 Degrees").
- No duplicates.
- Description under 140 chars.
- Return the JSON array with no prose, no code fences.`;

    const raw = await callGemini(VERTEX_API_KEY, prompt);
    const items = safeParseJson(raw);
    if (!items.length) {
      return new Response(JSON.stringify({ error: "empty_ai_result", raw: raw.slice(0, 500) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rows = items
      .map((it: any) => ({
        brand: String(it?.brand || "").trim(),
        model: String(it?.model || "").trim(),
        category: (CATEGORIES as readonly string[]).includes(String(it?.category)) ? it.category : "daily",
        year: Number.isFinite(Number(it?.year)) ? Number(it.year) : null,
        description: it?.description ? String(it.description).slice(0, 240) : null,
        source: "ai",
        active: true,
        refreshed_at: new Date().toISOString(),
      }))
      .filter((r) => r.brand && r.model);

    // Upsert on (brand, model)
    const { error: upErr } = await svc.from("shoes_catalog").upsert(rows, { onConflict: "brand,model" });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[shoes-refresh-catalog] error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
