// Generate a stylized share poster from a user-uploaded photo + activity stats
// using Gemini (Nano Banana 2) image editing via the Lovable AI Gateway.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Stats {
  distanceKm: number;
  timeStr: string;
  paceStr: string;
  calories?: number | null;
  hr?: number | null;
  elevation?: number | null;
}

const STYLE_PROMPTS: Record<string, string> = {
  bold_hype:
    "Style: high-energy magazine poster, bold hand-painted brush typography in vivid yellow/pink, slight grain, playful doodles (hearts, arrows, sun), high contrast.",
  minimal_zen:
    "Style: minimal Japanese editorial, soft muted palette, thin elegant typography, lots of breathing room, one tiny ink-brush accent.",
  retro_magazine:
    "Style: 90s sports magazine, halftone texture, big condensed serif headline, retro orange/teal palette, sticker-like stat card.",
};

function buildPrompt(stats: Stats, quote: string, style: string, lang: "en" | "zh") {
  const isZh = lang === "zh";
  const styleLine = STYLE_PROMPTS[style] || STYLE_PROMPTS.bold_hype;
  const headline = isZh
    ? `${stats.distanceKm.toFixed(0)}K 完成`
    : `${stats.distanceKm.toFixed(0)}K DONE`;
  const statsLine = isZh
    ? `距離 ${stats.distanceKm.toFixed(2)} 公里 · 時間 ${stats.timeStr} · 配速 ${stats.paceStr}/公里${stats.calories ? ` · ${stats.calories} 卡` : ""}`
    : `Distance ${stats.distanceKm.toFixed(2)} km · Time ${stats.timeStr} · Pace ${stats.paceStr}/km${stats.calories ? ` · ${stats.calories} kcal` : ""}`;

  return `Create a vertical 4:5 motivational running poster using the provided photo as the hero image. Keep the person clearly visible, recognizable, and unaltered (do NOT change their face, body, or clothing).

Add a bold headline at the top reading exactly: "${headline}".

Add a translucent rounded glass stat card in the lower-left containing exactly these stats on separate lines with small icons: ${statsLine}. Use a clean modern sans-serif for the stats.

Add a hand-written motivational quote in the upper-right reading exactly: "${quote}".

${styleLine}

Strict rules: do NOT add any watermark, logo, or extra text other than what is specified above. Do NOT distort the person. Spell every word exactly as written. Output a single finished poster image.`;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function generateQuote(
  apiKey: string,
  stats: Stats,
  lang: "en" | "zh",
): Promise<string> {
  const fallback = lang === "zh" ? "每一步都更靠近自己" : "Stronger than my excuses";
  try {
    const res = await fetchWithTimeout(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                lang === "zh"
                  ? "你是跑步教練。回覆一句不超過12字的繁體中文勵志短句，不加引號或標點裝飾。"
                  : "You are a running coach. Reply with ONE short motivational quote (max 8 words). No quotes or extra punctuation.",
            },
            {
              role: "user",
              content: `Just finished a ${stats.distanceKm.toFixed(2)}km run in ${stats.timeStr}.`,
            },
          ],
        }),
      },
      15000,
    );
    if (!res.ok) return fallback;
    const j = await res.json();
    const q = (j.choices?.[0]?.message?.content || "").trim().replace(/^["「『]|["」』]$/g, "");
    return q || fallback;
  } catch (_e) {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { imageBase64, mimeType, stats, quote, stylePreset, lang } = body as {
      imageBase64: string;
      mimeType: string;
      stats: Stats;
      quote?: string;
      stylePreset?: string;
      lang: "en" | "zh";
    };

    if (!imageBase64 || !mimeType || !stats) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve quote (fast path if provided, otherwise async with timeout+fallback).
    const finalQuote = (quote || "").trim() || (await generateQuote(LOVABLE_API_KEY, stats, lang));

    const prompt = buildPrompt(stats, finalQuote, stylePreset || "bold_hype", lang);
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    console.log(`[poster] start gemini image edit, prompt=${prompt.length}c, img=${imageBase64.length}b64`);
    const t0 = Date.now();
    let imgRes: Response;
    try {
      imgRes = await fetchWithTimeout(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3.1-flash-image-preview",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
            modalities: ["image", "text"],
          }),
        },
        110_000,
      );
    } catch (e) {
      console.error("[poster] gemini call aborted/failed", e);
      return new Response(
        JSON.stringify({ error: "Generation timed out, please try again." }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`[poster] gemini done in ${Date.now() - t0}ms status=${imgRes.status}`);

    if (!imgRes.ok) {
      const t = await imgRes.text();
      console.error("Image gen failed", imgRes.status, t.slice(0, 300));
      if (imgRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (imgRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Image generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imgJson = await imgRes.json();
    const imageUrl = imgJson.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      console.error("No image returned", JSON.stringify(imgJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "No image returned by model" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ imageDataUrl: imageUrl, quote: finalQuote }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-share-poster error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
