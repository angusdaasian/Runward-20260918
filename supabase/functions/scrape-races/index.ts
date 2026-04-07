import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOURCES = {
  japan: "https://www.flyareyou.com/a/japan-marathons?s_locale=en-us",
  overseas: "https://www.flyareyou.com/a/overseas-marathons?s_locale=en-us",
  hk: "https://fitz.hk/hksports-timetable/",
  china: "https://worldathletics.org/competition/calendar-results?competitionGroupId=3775&regionId=13188371&regionType=country",
};

interface RaceData {
  name: string;
  race_date: string;
  city: string;
  country: string;
  category: string;
  website_url: string | null;
  description: string | null;
  source: string;
}

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], waitFor: 10000 }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Firecrawl failed for ${url}: ${data.error || "Unknown error"}`);
  return data.data?.markdown || "";
}

async function callAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`AI call failed: ${res.status} ${t}`); }
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) content = jsonMatch[1].trim();
  return content;
}

const TODAY = new Date().toISOString().split("T")[0];

async function scrapeFlyAreYou(url: string, sourceLabel: string, firecrawlKey: string, aiKey: string): Promise<RaceData[]> {
  const md = await scrapeWithFirecrawl(url, firecrawlKey);
  console.log(`${sourceLabel} markdown: ${md.length} chars`);

  // Split into chunks of ~25000 chars to avoid token limits
  const chunks: string[] = [];
  for (let i = 0; i < md.length; i += 25000) {
    chunks.push(md.substring(i, i + 25000));
  }

  const allRaces: RaceData[] = [];

  for (const chunk of chunks) {
    const prompt = `Extract all running races/marathons from this page content.

For each race extract:
- name: the race name
- race_date: date in YYYY-MM-DD format. Skip if no date found.
- city: the city where the race takes place
- country: full country name (e.g. "Japan", "United States", "Hong Kong", "China")
- category: one of "Full Marathon", "Half Marathon", "10K", "5K", "Road Race", "Ultramarathon". Infer from the name or distance if not explicit.
- website_url: the official race website URL if available, or null
- description: null
- source: "${sourceLabel}"

Only include races with dates on or after ${TODAY}.
Return ONLY a valid JSON array. If no races found, return [].

CONTENT:
${chunk}`;

    const content = await callAI(aiKey, "Extract race data. Return only valid JSON array.", prompt);
    try {
      const parsed = JSON.parse(content);
      const valid = parsed.filter((r: any) => r.race_date && /^\d{4}-\d{2}-\d{2}$/.test(r.race_date) && r.race_date >= TODAY);
      allRaces.push(...valid.map((r: any) => ({ ...r, source: sourceLabel })));
    } catch { console.error(`Parse failed for ${sourceLabel} chunk`); }
  }

  return allRaces;
}

async function scrapeHKRaces(firecrawlKey: string, aiKey: string): Promise<RaceData[]> {
  const md = await scrapeWithFirecrawl(SOURCES.hk, firecrawlKey);
  console.log(`HK markdown: ${md.length} chars`);

  const prompt = `Extract road running races from this Hong Kong sports timetable.

IMPORTANT: The page has a "距離" (distance) column for each race. Use it to determine the category:
- If distances include "全馬", "42K", "Marathon" → category = "Full Marathon"
- If distances include "半馬", "21K", "HM" → category = "Half Marathon"  
- If distances include "10K" → category = "10K"
- If distances include "5K" → category = "5K"
- If distances include "3K" → category = "3K"
- If a race has MULTIPLE distances (e.g. "3, 6, 10K" or "10K, 半馬, 全馬"), use the LONGEST distance as the category.
- If distances include "100km" or anything over 42K → category = "Ultramarathon"
- Only use "Road Race" if no specific distance info is available.

Also capture the raw distance text (e.g. "3, 6, 10K" or "10K, 半馬, 全馬") in the description field so users can see all available distances.

CONTENT:
${md.substring(0, 30000)}

Return JSON array with: name, race_date (YYYY-MM-DD), city: "Hong Kong", country: "Hong Kong", category (use rules above), website_url or null, description (the raw distance text like "3K, 5K, 10K" or null), source: "fitz_hk".
Only ROAD RUNNING. Only races on or after ${TODAY}. Return ONLY JSON array.`;

  const content = await callAI(aiKey, "Extract HK race data. Return only valid JSON array.", prompt);
  try {
    return JSON.parse(content)
      .filter((r: RaceData) => r.race_date && /^\d{4}-\d{2}-\d{2}$/.test(r.race_date) && r.race_date >= TODAY)
      .map((r: RaceData) => ({ ...r, source: "fitz_hk", city: "Hong Kong", country: "Hong Kong" }));
  } catch { console.error("HK parse failed"); return []; }
}

async function scrapeChinaRaces(firecrawlKey: string, aiKey: string): Promise<RaceData[]> {
  const md = await scrapeWithFirecrawl(SOURCES.china, firecrawlKey);
  console.log(`China (World Athletics) markdown: ${md.length} chars`);

  const chunks: string[] = [];
  for (let i = 0; i < md.length; i += 25000) {
    chunks.push(md.substring(i, i + 25000));
  }

  const allRaces: RaceData[] = [];

  for (const chunk of chunks) {
    const prompt = `Extract road running races from this World Athletics calendar for China.

For each race extract:
- name: the race/competition name
- race_date: date in YYYY-MM-DD format. Skip if no date.
- city: the city in China
- country: "China"
- category: one of "Full Marathon", "Half Marathon", "10K", "5K", "Road Race", "Ultramarathon". Infer from name/distance.
- website_url: official website if available, or null
- description: null
- source: "world_athletics_china"

Only include races on or after ${TODAY}. Return ONLY a valid JSON array.

CONTENT:
${chunk}`;

    const content = await callAI(aiKey, "Extract China race data. Return only valid JSON array.", prompt);
    try {
      const parsed = JSON.parse(content);
      const valid = parsed.filter((r: any) => r.race_date && /^\d{4}-\d{2}-\d{2}$/.test(r.race_date) && r.race_date >= TODAY);
      allRaces.push(...valid.map((r: any) => ({ ...r, source: "world_athletics_china", country: "China" })));
    } catch { console.error("China parse chunk failed"); }
  }

  return allRaces;
}

async function deduplicateWithAI(races: RaceData[], aiKey: string): Promise<RaceData[]> {
  if (races.length <= 5) return races;

  const seen = new Map<string, RaceData>();
  for (const race of races) {
    const key = `${race.name.toLowerCase().replace(/[^a-z0-9]/g, "")}_${race.race_date}_${race.category}`;
    if (!seen.has(key)) seen.set(key, race);
  }
  let deduped = Array.from(seen.values());

  if (deduped.length > 10) {
    const raceList = deduped.map((r, i) => `${i}: "${r.name}" | ${r.race_date} | ${r.city}, ${r.country} | ${r.category}`).join("\n");

    const prompt = `Here is a list of races. Some may be duplicates with slightly different names (e.g. "Tokyo Marathon 2026" and "Tokyo Marathon"). 
Identify duplicates and return ONLY a JSON array of index numbers to KEEP (remove duplicates, keeping the entry with more info).

RACES:
${raceList.substring(0, 20000)}

Return ONLY a JSON array of integers, e.g. [0, 1, 3, 5, 7]`;

    try {
      const content = await callAI(aiKey, "Identify duplicate races. Return only JSON array of indices to keep.", prompt);
      const keepIndices: number[] = JSON.parse(content);
      if (Array.isArray(keepIndices) && keepIndices.length > 0) {
        deduped = keepIndices.filter(i => i >= 0 && i < deduped.length).map(i => deduped[i]);
      }
    } catch { console.log("AI dedup parse failed, using simple dedup"); }
  }

  return deduped;
}

async function verifyCategoriesWithAI(races: RaceData[], aiKey: string): Promise<RaceData[]> {
  if (races.length === 0) return races;

  // Process in batches of 30
  const result: RaceData[] = [];
  for (let i = 0; i < races.length; i += 30) {
    const batch = races.slice(i, i + 30);
    const raceList = batch.map((r, idx) => `${idx}: "${r.name}" | ${r.race_date} | ${r.city}, ${r.country} | current: ${r.category} | desc: ${r.description || "none"}`).join("\n");

    const prompt = `Verify and correct the category for each race below. Many races offer multiple distances (e.g. a marathon event may also have half marathon, 10K, 5K).

Rules:
- Use the LONGEST distance as the primary category
- Valid categories: "Full Marathon", "Half Marathon", "Ultramarathon", "10K", "5K", "3K", "Road Race"
- If the name contains "Marathon" or "馬拉松" and no other info, assume "Full Marathon"
- If description shows multiple distances like "3K, 5K, 10K, HM, FM", use "Full Marathon" (the longest)
- Keep "Road Race" only if truly unknown distance

Return a JSON array of objects: [{"index": 0, "category": "Full Marathon"}, ...]
Only include entries where the category should CHANGE. If all are correct, return [].

RACES:
${raceList}`;

    try {
      const content = await callAI(aiKey, "Verify race categories. Return only JSON array.", prompt);
      const changes: { index: number; category: string }[] = JSON.parse(content);
      const changeMap = new Map(changes.map(c => [c.index, c.category]));
      for (let j = 0; j < batch.length; j++) {
        const race = { ...batch[j] };
        if (changeMap.has(j)) {
          console.log(`Category fix: "${race.name}" ${race.category} → ${changeMap.get(j)}`);
          race.category = changeMap.get(j)!;
        }
        result.push(race);
      }
    } catch {
      console.error("Category verification failed for batch, keeping originals");
      result.push(...batch);
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const sourceFilter = url.searchParams.get("source"); // japan, overseas, hk, china

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase config missing");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let allRaces: RaceData[] = [];

    // Japan (flyareyou)
    if (!sourceFilter || sourceFilter === "japan") {
      console.log("Scraping Japan races from flyareyou...");
      const races = await scrapeFlyAreYou(SOURCES.japan, "flyareyou_japan", FIRECRAWL_API_KEY, LOVABLE_API_KEY);
      console.log(`Japan: ${races.length} races`);
      allRaces.push(...races);
    }

    // Overseas (flyareyou)
    if (!sourceFilter || sourceFilter === "overseas") {
      console.log("Scraping Overseas races from flyareyou...");
      const races = await scrapeFlyAreYou(SOURCES.overseas, "flyareyou_overseas", FIRECRAWL_API_KEY, LOVABLE_API_KEY);
      console.log(`Overseas: ${races.length} races`);
      allRaces.push(...races);
    }

    // Hong Kong (fitz.hk)
    if (!sourceFilter || sourceFilter === "hk") {
      console.log("Scraping HK races from fitz.hk...");
      const races = await scrapeHKRaces(FIRECRAWL_API_KEY, LOVABLE_API_KEY);
      console.log(`HK: ${races.length} races`);
      allRaces.push(...races);
    }

    // China (World Athletics)
    if (!sourceFilter || sourceFilter === "china") {
      console.log("Scraping China races from World Athletics...");
      const races = await scrapeChinaRaces(FIRECRAWL_API_KEY, LOVABLE_API_KEY);
      console.log(`China: ${races.length} races`);
      allRaces.push(...races);
    }

    // Deduplicate with AI
    console.log(`Before dedup: ${allRaces.length} races`);
    allRaces = await deduplicateWithAI(allRaces, LOVABLE_API_KEY);
    console.log(`After dedup: ${allRaces.length} races`);

    // Clear and insert
    const sourceMap: Record<string, string[]> = {
      japan: ["flyareyou_japan"],
      overseas: ["flyareyou_overseas"],
      hk: ["fitz_hk"],
      china: ["world_athletics_china"],
    };

    if (sourceFilter && sourceMap[sourceFilter]) {
      for (const sv of sourceMap[sourceFilter]) {
        await supabase.from("races").delete().eq("source", sv);
      }
    } else {
      await supabase.from("races").delete().in("source", [
        "flyareyou_japan", "flyareyou_overseas", "fitz_hk", "world_athletics_china",
        "aims", "world_majors", // clean up any old sources too
      ]);
    }

    if (allRaces.length > 0) {
      for (let i = 0; i < allRaces.length; i += 50) {
        const batch = allRaces.slice(i, i + 50);
        const { error } = await supabase.from("races").insert(
          batch.map(r => ({
            name: r.name, race_date: r.race_date, city: r.city, country: r.country,
            category: r.category, website_url: r.website_url, description: r.description, source: r.source,
          }))
        );
        if (error) throw new Error(`DB insert: ${error.message}`);
      }
    }

    console.log(`Done! ${allRaces.length} races stored`);
    return new Response(JSON.stringify({ success: true, racesUpdated: allRaces.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scrape-races error:", e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
