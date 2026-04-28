// Validic test connection — hardcoded sample credentials from quickstart screenshot.
// This is a TEST ONLY endpoint to verify the Validic API works. It does NOT touch
// the existing Garmin integration.
//
// Sample request from screenshot:
// curl 'https://api.prod.validic.com/organizations/{ORG_ID}/users/{USER_ID}/summaries?token=vx-...&start_date=...&end_date=...'

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Hardcoded sample credentials shown in the Validic quickstart "Try It" panel.
// Replace with secrets later for real usage.
const VALIDIC_ORG_ID = "69f02db64dac233483f560b8";
const VALIDIC_USER_ID = "fd1c872d-a976-41e1-b5dc-bfd1f4accce9";
const VALIDIC_TOKEN = Deno.env.get("VALIDIC_SAMPLE_TOKEN") ?? "vx-SAMPLE_TOKEN_FROM_DASHBOARD";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let startDate = daysAgoISO(6);
    let endDate = todayISO();

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.start_date === "string") startDate = body.start_date;
        if (typeof body?.end_date === "string") endDate = body.end_date;
      } catch {
        // ignore — use defaults
      }
    }

    const url = `https://api.prod.validic.com/organizations/${VALIDIC_ORG_ID}/users/${VALIDIC_USER_ID}/summaries?token=${encodeURIComponent(
      VALIDIC_TOKEN,
    )}&start_date=${startDate}&end_date=${endDate}`;

    console.log("[validic-test] GET", url.replace(VALIDIC_TOKEN, "***"));

    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    return new Response(
      JSON.stringify({
        success: res.ok,
        status: res.status,
        request: {
          org_id: VALIDIC_ORG_ID,
          user_id: VALIDIC_USER_ID,
          start_date: startDate,
          end_date: endDate,
          token_preview: VALIDIC_TOKEN.slice(0, 6) + "…",
        },
        data,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[validic-test] error", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
