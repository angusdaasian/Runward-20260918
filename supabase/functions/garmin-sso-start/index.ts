import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let origin: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      origin = body?.origin ?? null;
    } catch {
      origin = null;
    }

    // Fall back to the request's Origin / Referer header so we always have a callback host.
    if (!origin) {
      origin = req.headers.get("origin")
        || (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null);
    }

    if (!origin) {
      return new Response(JSON.stringify({ error: "No origin available for callback" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callback = `${origin}/garmin-callback`;
    const params = new URLSearchParams({
      service: callback,
      webhost: "https://sso.garmin.com",
      source: "https://connect.garmin.com/signin",
      redirectAfterAccountLoginUrl: callback,
      redirectAfterAccountCreationUrl: callback,
      gauthHost: "https://sso.garmin.com/sso",
      locale: "en_US",
      id: "gauth-widget",
      cssUrl: "https://connect.garmin.com/gauth-custom-v1.2-min.css",
      privacyStatementUrl: "https://www.garmin.com/en-US/privacy/connect/",
      clientId: "GarminConnect",
      rememberMeShown: "true",
      rememberMeChecked: "false",
      createAccountShown: "true",
      openCreateAccount: "false",
      usernameShown: "true",
      displayNameShown: "false",
      initialFocus: "true",
      embedWidget: "false",
      consumeServiceTicket: "false",
    });

    const url = `https://sso.garmin.com/sso/login?${params.toString()}`;
    return new Response(JSON.stringify({ url, callback }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("garmin-sso-start error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
