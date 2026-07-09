// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildVertexAuth } from "../_shared/vertex-auth.ts";

function getVertexProjectId(): string {
  return Deno.env.get("GOOGLE_VERTEX_PROJECT_ID")
    || Deno.env.get("GOOGLE_CLOUD_PROJECT")
    || Deno.env.get("GCLOUD_PROJECT")
    || "inbound-isotope-500908-n8";
}
function getVertexLocation(): string {
  return Deno.env.get("GOOGLE_VERTEX_LOCATION") || "global";
}

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

async function callGemini(apiKey: string, prompt: string, timeoutMs = 180_000): Promise<string> {
  const model = "gemini-3.1-pro-preview";
  const baseUrl = `https://aiplatform.googleapis.com/v1/projects/${getVertexProjectId()}/locations/${getVertexLocation()}/publishers/google/models/${model}:generateContent`;
  const { url, headers } = await buildVertexAuth(baseUrl, apiKey);
  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingLevel: "low" },
      responseMimeType: "application/json",
      maxOutputTokens: 32768,
      temperature: 0.4,
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
    const modelsPerBrand: number = Math.min(Math.max(Number(body?.modelsPerBrand) || 10, 3), 20);
    const brandsPerBatch: number = Math.min(Math.max(Number(body?.brandsPerBatch) || 4, 1), 8);

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

    const buildPrompt = (batch: string[]) => `You are a running-shoe catalog builder. For EACH brand below, list up to ${modelsPerBrand} of the LATEST (2024-2026) running shoe models actively sold. Be exhaustive within that cap — include the newest flagship releases (e.g. Asics Superblast 3, Metaspeed Sky/Edge Paris, Novablast 5, Gel-Nimbus 27; New Balance SC Elite v5, SC Trainer v3, Rebel v5, 1080v14, Fuelcell SuperComp Pacer v2; Li-Ning 赤兔/Red Hare 9 & 9 Ultra, 飞电 Feidian 5/5 Ultra, 绝影 Jueying Elite/Essential; Nike Vaporfly 4, Alphafly 3, Pegasus Premium/41, Streakfly 2; Adidas Adios Pro 4, Boston 13, Evo SL, Takumi Sen 11; Hoka Rocket X 3, Cielo X1 2.0, Mach 6/X 2, Skyward X; On Cloudboom Strike/Echo 3, Cloudmonster 2, Cloudsurfer Next; Puma Deviate Nitro Elite 3/Fast-R Nitro Elite 3, Velocity Nitro 3; Saucony Endorphin Elite 2, Pro 5, Speed 5, Kinvara Pro 2; Brooks Hyperion Elite 5, Ghost Max 2, Glycerin Max; Mizuno Wave Rebellion Pro 3/Flash 2, Neo Vista 2; Xtep 160X 6 Pro/5.0 Pro; Anta C202 GT Pro/Kelvin Kiptum; 361 Flame 2/Furious Future; Altra Vanish Carbon 2, FWD Experience; Salomon S/Lab Phantasm 2, Aero Glide 3; The North Face Summit Vectiv Pro 3; Kailas Fuga; Norda 001/002; Speedland SL/RTA, SL/HSV). Cover the whole spectrum: daily trainer, easy, tempo, interval/speed, race (carbon-plated), trail, recovery/max-cushion.

Brands: ${batch.join(", ")}

Return a JSON array only. Each item:
{ "brand": "Nike", "model": "Vaporfly 4", "category": "race", "year": 2025, "description": "Carbon-plated racing shoe with ZoomX foam." }

Rules:
- Category must be one of: daily, easy, tempo, interval, race, trail, recovery.
- Use official spelling: "Li-Ning", "New Balance", "Hoka", "Topo Athletic", "361 Degrees", "The North Face", "Under Armour".
- No duplicates. Description under 140 chars.
- Include every well-known 2024-2026 model per brand up to the cap — do NOT skip flagships.
- Return the JSON array with no prose, no code fences.`;

    // Batch brands to avoid output truncation & long single calls
    const batches: string[][] = [];
    for (let i = 0; i < brands.length; i += brandsPerBatch) batches.push(brands.slice(i, i + brandsPerBatch));

    const allItems: any[] = [];
    const errors: string[] = [];
    // Process batches with limited concurrency (2 at a time)
    const CONCURRENCY = 2;
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const slice = batches.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(slice.map((b) => callGemini(VERTEX_API_KEY, buildPrompt(b))));
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "fulfilled") {
          const parsed = safeParseJson(r.value);
          allItems.push(...parsed);
        } else {
          errors.push(`batch ${i + j}: ${String((r as any).reason?.message || r.reason)}`);
        }
      }
    }

    if (!allItems.length) {
      return new Response(JSON.stringify({ error: "empty_ai_result", errors }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const seen = new Set<string>();
    const rows = allItems
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
