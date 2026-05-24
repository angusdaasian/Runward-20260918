import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callVertexAI(opts: { apiKey: string; model?: string; messages: Array<{ role: string; content: any }> }): Promise<Response> {
  const VERTEX_MODEL_MAP: Record<string, string> = {
    "google/gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
    "google/gemini-2.5-flash": "gemini-2.5-flash",
    "google/gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
    "google/gemini-3-flash-preview": "gemini-3-flash-preview",
  };
  const model = VERTEX_MODEL_MAP[opts.model || ""] || (opts.model || "gemini-3-flash-preview").replace(/^google\//, "");
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${opts.apiKey}`;
  const systemParts: any[] = [];
  const contents: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") {
      systemParts.push({ text: typeof m.content === "string" ? m.content : "" });
      continue;
    }
    const role = m.role === "assistant" ? "model" : "user";
    let parts: any[];
    if (typeof m.content === "string") {
      parts = [{ text: m.content }];
    } else if (Array.isArray(m.content)) {
      parts = m.content.map((p: any) => {
        if (p.type === "text") return { text: p.text };
        if (p.type === "image_url") {
          const u = p.image_url?.url || "";
          const match = u.match(/^data:([^;]+);base64,(.+)$/);
          if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
          return { fileData: { fileUri: u, mimeType: "image/jpeg" } };
        }
        return { text: String(p) };
      });
    } else {
      parts = [{ text: String(m.content) }];
    }
    contents.push({ role, parts });
  }
  const body: any = { contents };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 110_000);
  let vRes: Response;
  try {
    vRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
  } catch (e) {
    clearTimeout(timer);
    console.error("Vertex fetch failed/aborted:", e, "model:", model);
    return new Response(JSON.stringify({ error: "Upstream timeout" }), { status: 504, headers: { "Content-Type": "application/json" } });
  }
  clearTimeout(timer);
  if (!vRes.ok) {
    const errBody = await vRes.text();
    console.error("Vertex error:", vRes.status, "model:", model, "body:", errBody.slice(0, 1000));
    return new Response(errBody, { status: vRes.status });
  }
  const vData = await vRes.json();
  const text = vData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require authenticated user
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await sb.auth.getClaims(token);
    if (error || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }


  try {
    const { frames, lang, translate, existingResult } = await req.json();
    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY");
    if (!VERTEX_API_KEY) throw new Error("GOOGLE_VERTEX_API_KEY is not configured");

    const isZh = lang === "zh";

    // --- Translation mode ---
    if (translate && existingResult) {
      const targetLang = isZh ? "Traditional Chinese (Hong Kong)" : "English";
      const translatePrompt = `Translate the following running posture analysis result into ${targetLang}. Keep the exact same JSON structure, only translate the text fields (feedback, strengths, improvements, summary). Do NOT change any numeric scores. Respond with JSON ONLY, no other text.

${JSON.stringify(existingResult)}`;

      const tlResp = await callVertexAI({
        apiKey: VERTEX_API_KEY,
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: translatePrompt },
        ],
      });

      if (!tlResp.ok) {
        const t = await tlResp.text();
        console.error("Translation error:", tlResp.status, t);
        return new Response(JSON.stringify({ error: "Translation failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tlData = await tlResp.json();
      const tlContent = tlData.choices?.[0]?.message?.content || "";
      let tlParsed;
      try {
        tlParsed = JSON.parse(tlContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      } catch {
        console.error("Failed to parse translation:", tlContent);
        return new Response(JSON.stringify({ error: "Failed to parse translation" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(tlParsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Analysis mode ---
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return new Response(JSON.stringify({ error: "No frames provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = isZh
      ? `你是一位專業的跑步姿勢分析教練。分析提供的跑步影片截圖，評估跑步姿勢。

你必須以 **JSON 格式** 回覆，格式如下（不要包含其他文字，只回傳 JSON）：

{
  "overall_score": <1-100的數字>,
  "sections": {
    "head": { "score": <1-100>, "feedback": "頭部姿勢分析..." },
    "shoulder": { "score": <1-100>, "feedback": "肩膀姿勢分析..." },
    "upper_limb": { "score": <1-100>, "feedback": "上肢擺動分析..." },
    "torso": { "score": <1-100>, "feedback": "軀幹姿勢分析..." },
    "lower_limb": { "score": <1-100>, "feedback": "下肢著地分析..." }
  },
  "strengths": ["優點1", "優點2"],
  "improvements": ["改善建議1", "改善建議2"],
  "summary": "整體摘要文字..."
}

請用繁體中文撰寫 feedback、strengths、improvements 和 summary。分數要根據實際姿勢客觀評估。`
      : `You are an expert running posture analysis coach. Analyze the provided video frames of a runner's form and evaluate their running posture.

You MUST respond in **JSON format only** (no other text, just the JSON):

{
  "overall_score": <number 1-100>,
  "sections": {
    "head": { "score": <1-100>, "feedback": "Head position analysis..." },
    "shoulder": { "score": <1-100>, "feedback": "Shoulder analysis..." },
    "upper_limb": { "score": <1-100>, "feedback": "Arm swing analysis..." },
    "torso": { "score": <1-100>, "feedback": "Torso posture analysis..." },
    "lower_limb": { "score": <1-100>, "feedback": "Foot strike and leg analysis..." }
  },
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "summary": "Overall summary text..."
}

Scores should be objective based on actual posture observed. Be specific in feedback.`;

    const imageContent = frames.map((frame: string) => ({
      type: "image_url",
      image_url: { url: frame },
    }));

    const response = await callVertexAI({
      apiKey: VERTEX_API_KEY,
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: isZh ? "請分析這些跑步姿勢截圖並以 JSON 格式回覆：" : "Analyze these running form frames and respond in JSON format:" },
            ...imageContent,
          ],
        },
      ],
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: isZh ? "請求過於頻繁，請稍後再試" : "Rate limited, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: isZh ? "額度不足，請充值" : "Payment required, please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    let parsed;
    try {
      const jsonMatch = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonMatch);
    } catch {
      console.error("Failed to parse AI JSON response:", content);
      parsed = {
        overall_score: 0,
        sections: {
          head: { score: 0, feedback: content },
          shoulder: { score: 0, feedback: "" },
          upper_limb: { score: 0, feedback: "" },
          torso: { score: 0, feedback: "" },
          lower_limb: { score: 0, feedback: "" },
        },
        strengths: [],
        improvements: [],
        summary: content,
      };
    }
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("posture analysis error:", e, e instanceof Error ? e.stack : "");
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
