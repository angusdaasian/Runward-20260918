// scrape-races v3 – bilingual (name + name_zh)
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
  china:
    "https://worldathletics.org/competition/calendar-results?competitionGroupId=3775&regionId=13188371&regionType=country",
  taiwan_en: "http://www.taipeimarathon.org.tw/contest.aspx?lang=en-US",
  taiwan_zh: "http://www.taipeimarathon.org.tw/contest.aspx",
};

interface RaceRaw {
  name: string;
  name_zh: string | null;
  race_date: string;
  city: string;
  country: string;
  categories: string[];
  website_url: string | null;
  description: string | null;
  source: string;
}

interface RaceRow {
  name: string;
  name_zh: string | null;
  race_date: string;
  city: string;
  country: string;
  category: string;
  website_url: string | null;
  description: string | null;
  source: string;
}

const CATEGORY_ORDER = ["Full Marathon", "Half Marathon", "Ultramarathon", "10K", "5K", "3K", "1K", "Road Race"];
const VALID_CATEGORIES = new Set(CATEGORY_ORDER);
const TODAY = new Date().toISOString().split("T")[0];
const EXTRACTION_SYSTEM = "Extract race data. Return only valid JSON array.";
const CATEGORIES_INSTRUCTION = `
IMPORTANT: Return ALL distances offered by the race as a "categories" array.
Valid values: "Full Marathon", "Half Marathon", "Ultramarathon", "10K", "5K", "3K", "1K", "Road Race"
Examples:
- A marathon that also has a half and 10K → categories: ["Full Marathon", "Half Marathon", "10K"]
- A 10K-only event → categories: ["10K"]
- Unknown distance → categories: ["Road Race"]
`;

/* ── Normalization helpers ── */

function ws(v: string | null | undefined): string {
  return (v || "").replace(/\s+/g, " ").trim();
}

function sortCats(cats: Iterable<string>): string[] {
  const s = new Set<string>();
  for (const c of cats) if (VALID_CATEGORIES.has(c)) s.add(c);
  if (s.size > 1) s.delete("Road Race");
  if (s.size === 0) s.add("Road Race");
  return CATEGORY_ORDER.filter((c) => s.has(c));
}

function normCity(v: string): string {
  const n = ws(v);
  if (/(maca[ou]|澳門|澳门)/i.test(n)) return "Macau";
  if (/(hong\s*kong|香港)/i.test(n)) return "Hong Kong";
  return n || "Unknown";
}

function normCountry(v: string): string {
  const n = ws(v);
  if (/(maca[ou]|澳門|澳门)/i.test(n)) return "Macau";
  if (/(hong\s*kong|香港)/i.test(n)) return "Hong Kong";
  if (/(中國|中国|china)/i.test(n)) return "China";
  if (/(日本|japan)/i.test(n)) return "Japan";
  if (/(台灣|台湾|taiwan)/i.test(n)) return "Taiwan";
  return n || "Unknown";
}

function inferLoc(r: Pick<RaceRaw, "name" | "city" | "country" | "website_url">): { city: string; country: string } {
  const raw = [r.name, r.city, r.country, r.website_url || ""].join(" ");
  if (/(maca[ou]|澳門|澳门|\/a\/mo-)/i.test(raw)) return { city: "Macau", country: "Macau" };
  if (/(hong\s*kong|香港)/i.test(raw)) return { city: normCity(r.city) || "Hong Kong", country: "Hong Kong" };
  if (/(台灣|台湾|taiwan|taipeimarathon\.org)/i.test(raw))
    return { city: normCity(r.city) || "Taiwan", country: "Taiwan" };
  return { city: normCity(r.city), country: normCountry(r.country) };
}

function parseDistanceText(text: string): string[] {
  if (!text) return [];
  const n = ws(text),
    cats = new Set<string>(),
    nums = new Set<number>();
  if (/全馬|\bFM\b|full marathon/i.test(n)) cats.add("Full Marathon");
  if (/半馬|\bHM\b|half marathon/i.test(n)) cats.add("Half Marathon");
  if (/ultra|超馬/i.test(n)) cats.add("Ultramarathon");
  for (const m of n.matchAll(/((?:\d+(?:\.\d+)?\s*[,，]\s*)+\d+(?:\.\d+)?)\s*K\b/gi))
    for (const v of m[1].split(/[,，]\s*/)) {
      const d = parseFloat(v.trim());
      if (!isNaN(d)) nums.add(d);
    }
  for (const m of n.matchAll(/(\d+(?:\.\d+)?)\s*(?:km|k)\b/gi)) {
    const d = parseFloat(m[1]);
    if (!isNaN(d)) nums.add(d);
  }
  for (const d of nums) {
    if (d >= 100) cats.add("Ultramarathon");
    else if (d >= 42) cats.add("Full Marathon");
    else if (d >= 21) cats.add("Half Marathon");
    else if (d === 10) cats.add("10K");
    else if (d === 5) cats.add("5K");
    else if (d === 3) cats.add("3K");
    else if (d === 1) cats.add("1K");
  }
  return sortCats(cats);
}

function sanitizeCats(cats: string[] | null | undefined, desc: string | null = null): string[] {
  const result = new Set<string>();
  for (const c of cats || []) {
    if (VALID_CATEGORIES.has(c)) result.add(c);
    for (const p of parseDistanceText(c)) result.add(p);
  }
  for (const p of parseDistanceText(desc || "")) result.add(p);
  return sortCats(result);
}

function normRace(race: RaceRaw): RaceRaw {
  const loc = inferLoc(race);
  return {
    ...race,
    name: ws(race.name),
    name_zh: race.name_zh ? ws(race.name_zh) : null,
    city: loc.city,
    country: loc.country,
    description: race.description ? ws(race.description) : null,
    categories: sanitizeCats(race.categories, race.description),
  };
}

function canon(v: string): string {
  let s = ws(v).toLowerCase().normalize("NFKC");
  const reps: [RegExp, string][] = [
    [/standard\s*chartered|渣打|渣馬|渣马|\bschkm?\b|\bschk\b/gi, "standardchartered"],
    [/hong\s*kong|香港/gi, "hongkong"],
    [/maca[ou]|澳門|澳门/gi, "macau"],
    [/taiwan|台灣|台湾/gi, "taiwan"],
    [/taipei|台北/gi, "taipei"],
    [/marathon|馬拉松|马拉松/gi, "marathon"],
    [/half\s*marathon|半馬|半马|\bhm\b/gi, "halfmarathon"],
    [/full\s*marathon|全馬|全马|\bfm\b/gi, "fullmarathon"],
    [/road\s*race|路跑/gi, "roadrace"],
    [/international|國際|国际/gi, "international"],
  ];
  s = s.replace(/\s*20\d{2}\s*/g, " ");
  for (const [p, r] of reps) s = s.replace(p, ` ${r} `);
  return s.replace(/[^a-z0-9]+/g, "");
}

function webHost(u: string | null): string {
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function raceIdentity(r: RaceRaw): string {
  let id = canon(r.name);
  for (const t of [canon(r.city), canon(r.country)]) if (t) id = id.split(t).join("");
  id = id.replace(
    /(?:international|marathon|halfmarathon|fullmarathon|ultramarathon|roadrace|race|run|10k|5k|3k|1k)+/g,
    "",
  );
  return id || webHost(r.website_url) || canon(r.name);
}

function raceKey(r: RaceRaw): string {
  const nr = normRace(r);
  return `${nr.race_date}__${canon(nr.city)}__${canon(nr.country)}__${raceIdentity(nr)}`;
}

function shouldMerge(a: RaceRaw, b: RaceRaw): boolean {
  if (a.race_date !== b.race_date) return false;
  const na = normRace(a),
    nb = normRace(b);
  if (canon(na.city) !== canon(nb.city) || canon(na.country) !== canon(nb.country)) return false;
  const ha = webHost(a.website_url),
    hb = webHost(b.website_url);
  if (ha && hb && ha === hb) return true;
  const ia = raceIdentity(na),
    ib = raceIdentity(nb);
  if (ia && ib && ia === ib) return true;
  const ka = canon(a.name),
    kb = canon(b.name);
  return !!ka && !!kb && (ka.includes(kb) || kb.includes(ka));
}

function mergeRaces(a: RaceRaw, b: RaceRaw): RaceRaw {
  const cats = sortCats([
    ...a.categories,
    ...b.categories,
    ...parseDistanceText(a.description || ""),
    ...parseDistanceText(b.description || ""),
  ]);
  const englishNames = [a.name, b.name].filter((n) => /[a-zA-Z]/.test(n)).sort((x, y) => y.length - x.length);
  const name = englishNames[0] || (a.name.length >= b.name.length ? a.name : b.name);
  // Merge name_zh: prefer the one that has Chinese characters
  const zhNames = [a.name_zh, b.name_zh].filter(Boolean) as string[];
  const name_zh = zhNames[0] || null;
  return normRace({
    name,
    name_zh,
    race_date: a.race_date,
    city: a.city || b.city,
    country: a.country || b.country,
    categories: cats,
    website_url: a.website_url || b.website_url,
    description: (a.description?.length || 0) >= (b.description?.length || 0) ? a.description : b.description,
    source: a.source,
  });
}

function compressRaces(races: RaceRaw[]): RaceRaw[] {
  const deduped: RaceRaw[] = [];
  for (const race of races.map(normRace)) {
    const idx = deduped.findIndex((e) => shouldMerge(e, race));
    if (idx >= 0) {
      const merged = mergeRaces(deduped[idx], race);
      console.log(`Merged "${race.name}" into "${merged.name}" → [${merged.categories.join(", ")}]`);
      deduped[idx] = merged;
    } else {
      deduped.push({ ...race });
    }
  }
  return deduped.map(normRace);
}

function expandRaces(rawRaces: RaceRaw[]): RaceRow[] {
  const rows: RaceRow[] = [];
  for (const race of rawRaces.map(normRace)) {
    for (const cat of race.categories) {
      rows.push({
        name: race.name,
        name_zh: race.name_zh,
        race_date: race.race_date,
        city: race.city,
        country: race.country,
        category: cat,
        website_url: race.website_url,
        description: race.description,
        source: race.source,
      });
    }
  }
  return rows;
}

/* ── Scraping helpers ── */

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

async function callVertexAIRaw(opts: { apiKey: string; model?: string; messages: Array<{ role: string; content: any }> }): Promise<{ ok: boolean; status: number; text: string; json?: any }> {
  const VERTEX_MODEL_MAP: Record<string, string> = {
    "google/gemini-2.5-flash": "gemini-2.5-flash",
    "google/gemini-3-flash-preview": "gemini-2.5-flash",
  };
  const model = VERTEX_MODEL_MAP[opts.model || ""] || (opts.model || "gemini-2.5-flash").replace(/^google\//, "");
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${opts.apiKey}`;
  const systemParts: any[] = [];
  const contents: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") { systemParts.push({ text: typeof m.content === "string" ? m.content : "" }); continue; }
    const role = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: typeof m.content === "string" ? m.content : String(m.content) }] });
  }
  const body: any = { contents };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  const vRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const vText = await vRes.text();
  if (!vRes.ok) return { ok: false, status: vRes.status, text: vText };
  try {
    const vData = JSON.parse(vText);
    const text = vData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    return { ok: true, status: 200, text, json: vData };
  } catch {
    return { ok: false, status: 500, text: vText };
  }
}

async function callAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await callVertexAIRaw({
    apiKey,
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  if (!res.ok) {
    throw new Error(`AI call failed: ${res.status} ${res.text}`);
  }
  let content = res.text || "";
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) content = jsonMatch[1].trim();
  return content;
}

async function scrapeFlyAreYou(
  url: string,
  sourceLabel: string,
  firecrawlKey: string,
  aiKey: string,
): Promise<RaceRaw[]> {
  const md = await scrapeWithFirecrawl(url, firecrawlKey);
  console.log(`${sourceLabel} markdown: ${md.length} chars`);
  const chunks: string[] = [];
  for (let i = 0; i < md.length; i += 25000) chunks.push(md.substring(i, i + 25000));
  const allRaces: RaceRaw[] = [];
  for (const chunk of chunks) {
    const prompt = `Extract all running races/marathons from this page content.
For each race extract:
- name: the race name (in English)
- race_date: date in YYYY-MM-DD format. Skip if no date found.
- city: the city where the race takes place
- country: full country name (e.g. "Japan", "United States", "Hong Kong", "China", "Macau")
- categories: array of ALL distance categories offered by this race
${CATEGORIES_INSTRUCTION}
- website_url: the official race website URL if available, or null
- description: null
- source: "${sourceLabel}"
Only include races with dates on or after ${TODAY}.
Return ONLY a valid JSON array. If no races found, return [].
CONTENT:
${chunk}`;
    const content = await callAI(aiKey, EXTRACTION_SYSTEM, prompt);
    try {
      const parsed = JSON.parse(content);
      const valid = parsed.filter(
        (r: any) => r.race_date && /^\d{4}-\d{2}-\d{2}$/.test(r.race_date) && r.race_date >= TODAY,
      );
      allRaces.push(
        ...valid.map((r: any) =>
          normRace({
            ...r,
            name_zh: null,
            source: sourceLabel,
            categories: Array.isArray(r.categories) ? r.categories : [r.category || "Road Race"],
          }),
        ),
      );
    } catch {
      console.error(`Parse failed for ${sourceLabel} chunk`);
    }
  }
  return allRaces.map(normRace);
}

async function scrapeHKRaces(firecrawlKey: string, aiKey: string): Promise<RaceRaw[]> {
  const md = await scrapeWithFirecrawl(SOURCES.hk, firecrawlKey);
  console.log(`HK markdown: ${md.length} chars`);
  const prompt = `You are parsing a Hong Kong sports timetable in markdown table format.
The table has columns: 日期 | 比賽 | 類別 | 距離 | 起點
TASK: Extract ONLY rows where 類別 = "路跑" (road running). Skip 越野, 行山, 游泳, 定向, 步行.
For EACH road running race, the "距離" column lists ALL distances offered, like "1, 3, 10K" or "10K, 半馬, 全馬".
You MUST split these into a "categories" array with EVERY distance mapped as follows:
- "1K" or just "1" before K → "1K"
- "2K" or just "2" → "Road Race"
- "3K" or just "3" before K → "3K"
- "5K" or just "5" before K → "5K"
- "10K" → "10K"
- "21K" or "半馬" or "HM" → "Half Marathon"
- "23K" → "Half Marathon"
- "42K" or "全馬" or "FM" → "Full Marathon"
- "100km" or anything over 42K → "Ultramarathon"

For each race also extract a Chinese name ("name_zh") from the 比賽 column (the original Chinese text).
And an English name ("name") — translate the Chinese race name to English if no English name is visible.

Return JSON array with:
- name: English race name
- name_zh: Chinese race name (from 比賽 column)
- race_date: YYYY-MM-DD (year from section header, date from 日期 column like "4.11" → "2026-04-11")
- city: "Hong Kong"
- country: "Hong Kong"
- categories: array of ALL mapped distances
- website_url: URL from the markdown link or null
- description: raw distance text from 距離 column
- source: "fitz_hk"
Only include races on or after ${TODAY}. Return ONLY a valid JSON array.
CONTENT:
${md.substring(0, 30000)}`;
  const content = await callAI(
    aiKey,
    "Extract race data with ALL distances as categories array and both English and Chinese names. Return only valid JSON array.",
    prompt,
  );
  console.log(`HK AI response preview: ${content.substring(0, 500)}`);
  try {
    const parsed = JSON.parse(content);
    const results = parsed
      .filter((r: any) => r.race_date && /^\d{4}-\d{2}-\d{2}$/.test(r.race_date) && r.race_date >= TODAY)
      .map((r: any) => {
        const desc = r.description || "";
        const aiCats = Array.isArray(r.categories) && r.categories.length > 1 ? r.categories : null;
        const categories = aiCats || parseDistanceText(desc);
        return normRace({
          ...r,
          name_zh: r.name_zh || null,
          source: "fitz_hk",
          city: "Hong Kong",
          country: "Hong Kong",
          categories: categories.length > 0 ? categories : [r.category || "Road Race"],
        });
      });
    for (const r of results) console.log(`  HK race: "${r.name}" (zh: "${r.name_zh}") → [${r.categories.join(", ")}]`);
    return results;
  } catch (e) {
    console.error("HK parse failed:", e);
    return [];
  }
}

async function scrapeChinaRaces(firecrawlKey: string, aiKey: string): Promise<RaceRaw[]> {
  const md = await scrapeWithFirecrawl(SOURCES.china, firecrawlKey);
  console.log(`China (World Athletics) markdown: ${md.length} chars`);
  const chunks: string[] = [];
  for (let i = 0; i < md.length; i += 25000) chunks.push(md.substring(i, i + 25000));
  const allRaces: RaceRaw[] = [];
  for (const chunk of chunks) {
    const prompt = `Extract road running races from this World Athletics calendar for China.
For each race extract:
- name: the race/competition name in English
- race_date: date in YYYY-MM-DD format. Skip if no date.
- city: the city in China
- country: "China"
- categories: array of ALL distance categories offered
${CATEGORIES_INSTRUCTION}
- website_url: official website if available, or null
- description: null
- source: "world_athletics_china"
Only include races on or after ${TODAY}. Return ONLY a valid JSON array.
CONTENT:
${chunk}`;
    const content = await callAI(aiKey, EXTRACTION_SYSTEM, prompt);
    try {
      const parsed = JSON.parse(content);
      const valid = parsed.filter(
        (r: any) => r.race_date && /^\d{4}-\d{2}-\d{2}$/.test(r.race_date) && r.race_date >= TODAY,
      );
      allRaces.push(
        ...valid.map((r: any) =>
          normRace({
            ...r,
            name_zh: null,
            source: "world_athletics_china",
            country: "China",
            categories: Array.isArray(r.categories) ? r.categories : [r.category || "Road Race"],
          }),
        ),
      );
    } catch {
      console.error("China parse chunk failed");
    }
  }
  return allRaces.map(normRace);
}

async function scrapeTaiwanRaces(firecrawlKey: string, aiKey: string): Promise<RaceRaw[]> {
  const [mdEn, mdZh] = await Promise.all([
    scrapeWithFirecrawl(SOURCES.taiwan_en, firecrawlKey),
    scrapeWithFirecrawl(SOURCES.taiwan_zh, firecrawlKey),
  ]);
  console.log(`Taiwan EN markdown: ${mdEn.length} chars, ZH markdown: ${mdZh.length} chars`);

  const combined = `=== ENGLISH VERSION ===\n${mdEn.substring(0, 20000)}\n\n=== CHINESE VERSION ===\n${mdZh.substring(0, 20000)}`;

  const prompt = `You are parsing a Taiwan race calendar from taipeimarathon.org.tw. The data is in a table with columns: Race Event, Date, Location, Distance, Organizer, Deadline.
Both English and Chinese versions of the SAME page are provided. They list the SAME races — do NOT create duplicates.

For EACH race, extract BOTH the English name AND Chinese name:
- name: English race name (from the English version)
- name_zh: Chinese race name (from the Chinese version). Match them by date + position in the table.

- race_date: YYYY-MM-DD. The year is 2025 or 2026 depending on context (month headers like "4月" = April). Use the date from the "Date" column.
- city: city/location in Taiwan (e.g. "Taipei", "Yilan", "Pingtung")
- country: "Taiwan"
- categories: array of ALL distance categories. Parse the "Distance" column:
  - 42.195K or 42K → "Full Marathon"
  - 21K or 21.0975K → "Half Marathon"  
  - 100K, 50K, 70K or anything over 42K → "Ultramarathon"
  - 10K → "10K"
  - 5K → "5K"
  - 3K → "3K"
  - 1K → "1K"
  - Other distances (6K, 11K, 13K, 30K etc.) → "Road Race"
  - If a race has e.g. "42.195K21K11K5K", that means 4 categories: ["Full Marathon", "Half Marathon", "Road Race", "5K"]
${CATEGORIES_INSTRUCTION}
- website_url: the URL from the race name link, or null
- description: raw distance text
- source: "taipei_marathon_tw"

Only include races with dates on or after ${TODAY}. Skip events labeled as "Activity", "Triathlon", "接力賽" (relay). Focus on running races.
IMPORTANT: The English and Chinese tables have the SAME races. Output each race ONCE with both name and name_zh.
Return ONLY a valid JSON array.

CONTENT:
${combined}`;

  const content = await callAI(aiKey, EXTRACTION_SYSTEM, prompt);
  console.log(`Taiwan AI response preview: ${content.substring(0, 500)}`);

  try {
    const parsed = JSON.parse(content);
    const results = parsed
      .filter((r: any) => r.race_date && /^\d{4}-\d{2}-\d{2}$/.test(r.race_date) && r.race_date >= TODAY)
      .map((r: any) => {
        const desc = r.description || "";
        const aiCats = Array.isArray(r.categories) && r.categories.length > 0 ? r.categories : null;
        const categories = aiCats || parseDistanceText(desc);
        return normRace({
          ...r,
          name_zh: r.name_zh || null,
          source: "taipei_marathon_tw",
          country: "Taiwan",
          categories: categories.length > 0 ? categories : [r.category || "Road Race"],
        });
      });
    for (const r of results) console.log(`  TW race: "${r.name}" (zh: "${r.name_zh}") → [${r.categories.join(", ")}]`);
    return results;
  } catch (e) {
    console.error("Taiwan parse failed:", e);
    return [];
  }
}

async function deduplicateRaces(races: RaceRaw[], aiKey: string): Promise<RaceRaw[]> {
  if (races.length <= 5) return races.map(normRace);
  let deduped = compressRaces(races);
  if (deduped.length > 10) {
    const raceList = deduped
      .map((r, i) => `${i}: "${r.name}" | ${r.race_date} | ${r.city}, ${r.country} | ${r.categories.join(", ")}`)
      .join("\n");
    const prompt = `Here is a list of races. Some may be duplicates with:
- Slightly different names (e.g. "Tokyo Marathon 2026" and "Tokyo Marathon")
- Chinese vs English names for the same race (e.g. "香港渣打馬拉松" and "Standard Chartered Hong Kong Marathon" are the SAME race)
- Abbreviated vs full names (e.g. "SCHK Marathon" and "Standard Chartered HK Marathon")
IMPORTANT: Compare Chinese and English names carefully. Many races in HK, China, Japan, and Macau have both Chinese and English names that refer to the same event.
For duplicates, KEEP the entry with more categories and merge categories from both entries.
Return a JSON object: {"keep": [indices to keep], "merge": [[kept_index, removed_index], ...]}
The "merge" array tells which removed race's categories should be added to the kept race.
RACES:
${raceList.substring(0, 20000)}`;
    try {
      const content = await callAI(
        aiKey,
        "Identify duplicate races including Chinese/English name matches. Return only JSON.",
        prompt,
      );
      const result = JSON.parse(content);
      if (result.keep && Array.isArray(result.keep)) {
        if (result.merge && Array.isArray(result.merge)) {
          for (const [keepIdx, removeIdx] of result.merge) {
            if (keepIdx >= 0 && keepIdx < deduped.length && removeIdx >= 0 && removeIdx < deduped.length) {
              deduped[keepIdx] = mergeRaces(deduped[keepIdx], deduped[removeIdx]);
              console.log(
                `AI merged "${deduped[removeIdx].name}" into "${deduped[keepIdx].name}" → [${deduped[keepIdx].categories.join(", ")}]`,
              );
            }
          }
        }
        deduped = result.keep.filter((i: number) => i >= 0 && i < deduped.length).map((i: number) => deduped[i]);
      }
    } catch {
      console.log("AI dedup parse failed, using deterministic dedup only");
    }
  }
  return compressRaces(deduped);
}

async function verifyCategoriesWithAI(races: RaceRaw[], aiKey: string): Promise<RaceRaw[]> {
  if (races.length === 0) return races;
  const result: RaceRaw[] = [];
  for (let i = 0; i < races.length; i += 40) {
    const batch = races.slice(i, i + 40).map(normRace);
    const raceList = batch
      .map(
        (r, idx) =>
          `${idx}: "${r.name}" | ${r.city}, ${r.country} | cats: [${r.categories.join(", ")}] | desc: ${r.description || "none"}`,
      )
      .join("\n");
    const prompt = `You are a running race expert. Review each race and ensure ALL distance categories are captured.
RULES:
1. Many major races offer MULTIPLE distances (e.g. "Tokyo Marathon" → Full Marathon + 10K; most city marathons → Full + Half)
2. Use your KNOWLEDGE of well-known races to ADD missing categories
3. Parse description: "1, 3, 10K" = three categories: 1K, 3K, 10K
4. If name has "Marathon" but only "Road Race" → add "Full Marathon" or "Half Marathon"
5. Valid: "Full Marathon","Half Marathon","Ultramarathon","10K","5K","3K","1K","Road Race"
6. Remove "Road Race" if specific distance known
Return JSON array: [{"index":0,"categories":["Full Marathon","Half Marathon","10K"]},...]
Only include races needing changes. Return [] if all correct.
RACES:
${raceList}`;
    try {
      const content = await callAI(
        aiKey,
        "Verify race categories using your knowledge. Return only valid JSON array.",
        prompt,
      );
      const changes: { index: number; categories: string[] }[] = JSON.parse(content);
      const changeMap = new Map(changes.map((c) => [c.index, c.categories]));
      for (let j = 0; j < batch.length; j++) {
        const race = { ...batch[j] };
        if (changeMap.has(j)) {
          const merged = sortCats([...race.categories, ...changeMap.get(j)!]);
          if (merged.join(",") !== race.categories.join(",")) {
            console.log(`Cat fix: "${race.name}" [${race.categories.join(",")}] → [${merged.join(",")}]`);
            race.categories = merged;
          }
        }
        result.push(normRace(race));
      }
    } catch {
      console.error("Cat verify failed for batch, keeping originals");
      result.push(...batch.map(normRace));
    }
  }
  return result.map(normRace);
}

/* ── Translate race names to Chinese ── */

async function translateNamesToZh(races: RaceRaw[], aiKey: string): Promise<RaceRaw[]> {
  // Only translate races that don't already have name_zh
  const needTranslation = races.filter((r) => !r.name_zh);
  if (needTranslation.length === 0) return races;

  console.log(`Translating ${needTranslation.length} race names to Chinese...`);
  const result = [...races];

  // Process in batches of 50
  for (let i = 0; i < needTranslation.length; i += 50) {
    const batch = needTranslation.slice(i, i + 50);
    const nameList = batch.map((r, idx) => `${idx}: "${r.name}" (${r.city}, ${r.country})`).join("\n");
    const prompt = `Translate these running race event names to Traditional Chinese (繁體中文).
Use the official Chinese name if you know it (e.g. "Tokyo Marathon" → "東京馬拉松", "Standard Chartered Hong Kong Marathon" → "渣打香港馬拉松").
If you don't know the official name, translate naturally.
Return a JSON array: [{"index": 0, "name_zh": "中文名稱"}, ...]
Include ALL races. Return ONLY valid JSON array.

RACES:
${nameList}`;
    try {
      const content = await callAI(
        aiKey,
        "Translate race names to Traditional Chinese. Return only valid JSON array.",
        prompt,
      );
      const translations: { index: number; name_zh: string }[] = JSON.parse(content);
      for (const t of translations) {
        const originalRace = batch[t.index];
        if (!originalRace) continue;
        // Find this race in the result array and set name_zh
        const resultIdx = result.findIndex(
          (r) => r.name === originalRace.name && r.race_date === originalRace.race_date && !r.name_zh,
        );
        if (resultIdx >= 0 && t.name_zh) {
          result[resultIdx] = { ...result[resultIdx], name_zh: ws(t.name_zh) };
          console.log(`  Translated: "${originalRace.name}" → "${t.name_zh}"`);
        }
      }
    } catch (e) {
      console.error(`Translation batch failed:`, e);
    }
  }
  return result;
}

/* ── Cross-source dedup ── */

async function crossSourceDedup(supabase: any): Promise<{ merged: number; total: number }> {
  const { data: allRows } = await supabase
    .from("races")
    .select("id, name, name_zh, race_date, city, country, category, website_url, description, source")
    .gte("race_date", TODAY);

  if (!allRows || allRows.length === 0) return { merged: 0, total: 0 };

  const raceMap = new Map<string, RaceRaw>();
  for (const row of allRows) {
    const nr = normRace({
      name: row.name,
      name_zh: row.name_zh || null,
      race_date: row.race_date,
      city: row.city,
      country: row.country,
      categories: [row.category],
      website_url: row.website_url,
      description: row.description,
      source: row.source,
    });
    const key = raceKey(nr);
    if (raceMap.has(key)) {
      raceMap.set(key, mergeRaces(raceMap.get(key)!, nr));
    } else {
      raceMap.set(key, nr);
    }
  }

  const compressed = compressRaces(Array.from(raceMap.values()));
  const mergedCount = allRows.length - compressed.reduce((sum: number, r: RaceRaw) => sum + r.categories.length, 0);

  if (mergedCount > 0 || compressed.length < raceMap.size) {
    console.log(`Cross-source dedup: ${raceMap.size} grouped → ${compressed.length} unique races`);
    const { error: delErr } = await supabase.from("races").delete().not("id", "is", null);
    if (delErr) throw new Error(`Cross-source dedup delete: ${delErr.message}`);
    const rows = expandRaces(compressed);
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase
        .from("races")
        .insert(
          batch.map((r) => ({
            name: r.name,
            name_zh: r.name_zh,
            race_date: r.race_date,
            city: r.city,
            country: r.country,
            category: r.category,
            website_url: r.website_url,
            description: r.description,
            source: r.source,
          })),
        );
      if (error) throw new Error(`Cross-source dedup insert: ${error.message}`);
    }
    return { merged: raceMap.size - compressed.length, total: rows.length };
  }
  return { merged: 0, total: allRows.length };
}

/* ── Main handler ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const sourceFilter = url.searchParams.get("source");

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY");
    if (!VERTEX_API_KEY) throw new Error("VERTEX_API_KEY not configured");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase config missing");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let allRawRaces: RaceRaw[] = [];

    if (!sourceFilter || sourceFilter === "japan") {
      console.log("Scraping Japan races from flyareyou...");
      const races = await scrapeFlyAreYou(SOURCES.japan, "flyareyou_japan", FIRECRAWL_API_KEY, VERTEX_API_KEY);
      console.log(`Japan: ${races.length} races`);
      allRawRaces.push(...races);
    }

    if (!sourceFilter || sourceFilter === "overseas") {
      console.log("Scraping Overseas races from flyareyou...");
      const races = await scrapeFlyAreYou(SOURCES.overseas, "flyareyou_overseas", FIRECRAWL_API_KEY, VERTEX_API_KEY);
      console.log(`Overseas: ${races.length} races`);
      allRawRaces.push(...races);
    }

    if (!sourceFilter || sourceFilter === "hk") {
      console.log("Scraping HK races from fitz.hk...");
      const races = await scrapeHKRaces(FIRECRAWL_API_KEY, VERTEX_API_KEY);
      console.log(`HK: ${races.length} races`);
      allRawRaces.push(...races);
    }

    if (!sourceFilter || sourceFilter === "china") {
      console.log("Scraping China races from World Athletics...");
      const races = await scrapeChinaRaces(FIRECRAWL_API_KEY, VERTEX_API_KEY);
      console.log(`China: ${races.length} races`);
      allRawRaces.push(...races);
    }

    if (!sourceFilter || sourceFilter === "taiwan") {
      console.log("Scraping Taiwan races from taipeimarathon.org.tw...");
      const races = await scrapeTaiwanRaces(FIRECRAWL_API_KEY, VERTEX_API_KEY);
      console.log(`Taiwan: ${races.length} races`);
      allRawRaces.push(...races);
    }

    console.log(`Before dedup: ${allRawRaces.length} races`);
    allRawRaces = await deduplicateRaces(allRawRaces, VERTEX_API_KEY);
    console.log(`After dedup: ${allRawRaces.length} races`);

    console.log("Verifying categories with AI...");
    allRawRaces = await verifyCategoriesWithAI(allRawRaces, VERTEX_API_KEY);
    allRawRaces = compressRaces(allRawRaces);
    console.log("Category verification complete");

    // Translate names to Chinese for races that don't have name_zh yet
    console.log("Translating race names to Chinese...");
    allRawRaces = await translateNamesToZh(allRawRaces, VERTEX_API_KEY);
    console.log("Translation complete");

    const allRows = expandRaces(allRawRaces);
    console.log(`Expanded to ${allRows.length} rows from ${allRawRaces.length} races`);

    // Delete source rows and insert new ones
    const sourceMap: Record<string, string[]> = {
      japan: ["flyareyou_japan"],
      overseas: ["flyareyou_overseas"],
      hk: ["fitz_hk"],
      china: ["world_athletics_china"],
      taiwan: ["taipei_marathon_tw"],
    };

    if (sourceFilter && sourceMap[sourceFilter]) {
      for (const sv of sourceMap[sourceFilter]) {
        await supabase.from("races").delete().eq("source", sv);
      }
    } else {
      await supabase.from("races").delete().not("id", "is", null);
    }

    if (allRows.length > 0) {
      for (let i = 0; i < allRows.length; i += 50) {
        const batch = allRows.slice(i, i + 50);
        const { error } = await supabase
          .from("races")
          .insert(
            batch.map((r) => ({
              name: r.name,
              name_zh: r.name_zh,
              race_date: r.race_date,
              city: r.city,
              country: r.country,
              category: r.category,
              website_url: r.website_url,
              description: r.description,
              source: r.source,
            })),
          );
        if (error) throw new Error(`DB insert: ${error.message}`);
      }
    }

    // Only run cross-source dedup when scraping ALL sources
    let dedupResult = { merged: 0, total: allRows.length };
    if (!sourceFilter) {
      console.log("Running cross-source dedup...");
      dedupResult = await crossSourceDedup(supabase);
      console.log(`Cross-source dedup: ${dedupResult.merged} merges, ${dedupResult.total} total rows`);
    }

    console.log(`Done! ${dedupResult.total} race rows stored`);
    return new Response(
      JSON.stringify({
        success: true,
        uniqueRaces: allRawRaces.length,
        totalRows: dedupResult.total,
        crossSourceMerges: dedupResult.merged,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("scrape-races error:", e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
