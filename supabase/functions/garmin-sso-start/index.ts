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
    let deeplinkScheme: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      origin = body?.origin ?? null;
      deeplinkScheme = typeof body?.deeplink_scheme === "string" ? body.deeplink_scheme.trim() : null;
    } catch {
      origin = null;
      deeplinkScheme = null;
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
    // CRITICAL: Garmin's CAS only accepts Garmin-owned domains as the `service`
    // URL. Custom domains are silently rejected after MFA (loops back to login).
    // We MUST use https://sso.garmin.com/sso/embed and run the SSO inside an
    // iframe; Garmin's casEmbedSuccess.html will postMessage the ticket to
    // window.parent (our app) using the `source` param as the parent origin.
    const embedServiceUrl = "https://sso.garmin.com/sso/embed";

    const iframeParams = new URLSearchParams({
      id: "gauth-widget",
      embedWidget: "true",
      gauthHost: "https://sso.garmin.com/sso/embed",
      service: embedServiceUrl,
      source: embedServiceUrl, // CRITICAL: must be a Garmin URL — becomes parent_url in casEmbedSuccess.html
      redirectAfterAccountLoginUrl: embedServiceUrl,
      redirectAfterAccountCreationUrl: embedServiceUrl,
      consumeServiceTicket: "false",
      locale: "en_US",
      clientId: "GarminConnect",
      cssUrl: "https://static.garmincdn.com/com.garmin.connect/ui/css/gauth-custom-v1.2-min.css",
      privacyStatementUrl: "https://www.garmin.com/en-US/privacy/connect/",
      rememberMeShown: "true",
      rememberMeChecked: "false",
      createAccountShown: "true",
      openCreateAccount: "false",
      displayNameShown: "false",
      initialFocus: "true",
      generateExtraServiceTicket: "true",
      generateTwoExtraServiceTickets: "false",
      generateNoServiceTicket: "false",
      globalOptInShown: "true",
      globalOptInChecked: "false",
      mobile: "false",
      connectLegalTerms: "true",
      showTermsOfUse: "false",
      showPrivacyPolicy: "false",
      showConnectLegalAge: "false",
      locationPromptShown: "true",
      showPassword: "true",
      useCustomHeader: "false",
      rememberMyBrowserShown: "true",
      rememberMyBrowserChecked: "false",
    });

    const iframeUrl = `https://sso.garmin.com/sso/signin?${iframeParams.toString()}`;

    return new Response(JSON.stringify({
      url: iframeUrl,
      iframe_url: iframeUrl,
      service_url: embedServiceUrl,
      callback,
      parent_origin: origin,
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
