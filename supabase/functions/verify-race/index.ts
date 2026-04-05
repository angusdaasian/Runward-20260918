import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, race_date, place, category } = await req.json();

    if (!name || !race_date || !place || !category) {
      return new Response(JSON.stringify({ error: "All fields are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a running race verification assistant. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
      }),
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
