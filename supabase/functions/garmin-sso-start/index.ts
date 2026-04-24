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

    // PROVEN-WORKING RECIPE (per GitHub issue #348 / postmessage.js analysis):
    //   gauthHost = https://sso.garmin.com/sso        (NOT /sso/embed)
    //   service   = https://sso.garmin.com/sso/embed  (this triggers casEmbedSuccess.html)
    //   source    = <our app origin>                  (used as targetOrigin in postMessage)
    //
    // Garmin's casEmbedSuccess.html reads `source` and uses it as parent_url
    // when calling XD.postMessage(JSON, parent_url, window.parent). If `source`
    // is empty OR if `service` doesn't point to /sso/embed, no postMessage fires.
    const gauthHost = "https://sso.garmin.com/sso";
    const embedServiceUrl = "https://sso.garmin.com/sso/embed";

    // Trimmed to the proven-working core. Extra UI flags removed — they were
    // never required and add risk of CAS rejecting the request.
    const iframeParams = new URLSearchParams({
      id: "gauth-widget",
      embedWidget: "true",
      gauthHost,
      service: embedServiceUrl,
      source: origin,
      redirectAfterAccountLoginUrl: embedServiceUrl,
      redirectAfterAccountCreationUrl: embedServiceUrl,
      consumeServiceTicket: "false",
      clientId: "GarminConnect",
      locale: "en_US",
      generateExtraServiceTicket: "true",
    });

    const iframeUrl = `${gauthHost}/signin?${iframeParams.toString()}`;
    const callback = `${origin}/garmin-callback`;

    const diagnostics = {
      gauthHost,
      service: embedServiceUrl,
      source: origin,
      iframe_url_length: iframeUrl.length,
    };

    console.log("[garmin-sso-start] generated iframe URL", diagnostics);

    return new Response(JSON.stringify({
      url: iframeUrl,
      iframe_url: iframeUrl,
      service_url: embedServiceUrl,
      callback,
      parent_origin: origin,
      diagnostics,
    }), {
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
