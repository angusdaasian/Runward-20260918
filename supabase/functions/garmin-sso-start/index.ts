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
    const mobileBridge = `${origin}/garmin-mobile-auth`;
    const nativeCallbackBase = `${origin}/garmin-native-callback.html`;
    const normalizedDeeplinkScheme = deeplinkScheme || "runward";
    // Canonical native service URL — must be byte-for-byte identical here and in
    // the static callback page so Garmin CAS accepts the ticket exchange.
    const nativeCallback = `${nativeCallbackBase}?deeplinkScheme=${encodeURIComponent(normalizedDeeplinkScheme)}`;
    const serviceUrl = "https://sso.garmin.com/sso/embed";
    const nativeServiceUrl = nativeCallback;
    // Desktop popup is a TOP-LEVEL browsing context (separate window, not an
    // iframe), so we must NOT use embedWidget mode. Embed mode causes CAS to
    // redirect to its own embed landing page after credentials submit instead
    // of redirecting back to our `service` URL with a ticket — which is why
    // the popup loops back to the sign-in page.
    const params = new URLSearchParams({
      service: callback,
      webhost: "https://sso.garmin.com",
      source: callback,
      redirectAfterAccountLoginUrl: callback,
      redirectAfterAccountCreationUrl: callback,
      gauthHost: "https://sso.garmin.com/sso",
      locale: "en_US",
      id: "gauth-widget",
      cssUrl: "https://static.garmincdn.com/com.garmin.connect/ui/css/gauth-custom-v1.2-min.css",
      privacyStatementUrl: "https://www.garmin.com/en-US/privacy/connect/",
      clientId: "GarminConnect",
      rememberMeShown: "true",
      rememberMeChecked: "false",
      createAccountShown: "true",
      openCreateAccount: "false",
      displayNameShown: "false",
      consumeServiceTicket: "false",
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

    const url = `https://sso.garmin.com/sso/signin?${params.toString()}`;

    const mobileParams = new URLSearchParams({
      id: "gauth-widget",
      embedWidget: "true",
      gauthHost: "https://sso.garmin.com/sso",
      locale: "en_US",
      clientId: "GarminConnect",
      service: serviceUrl,
      source: mobileBridge,
      redirectAfterAccountLoginUrl: serviceUrl,
      redirectAfterAccountCreationUrl: serviceUrl,
      rememberMeShown: "true",
      rememberMeChecked: "false",
      createAccountShown: "true",
      openCreateAccount: "false",
      displayNameShown: "false",
      consumeServiceTicket: "false",
      generateExtraServiceTicket: "true",
      generateTwoExtraServiceTickets: "false",
      generateNoServiceTicket: "false",
      showTermsOfUse: "false",
      showPrivacyPolicy: "false",
      connectLegalTerms: "true",
      showConnectLegalAge: "false",
      locationPromptShown: "true",
      useCustomHeader: "false",
    });

    const mobileEmbedUrl = `https://sso.garmin.com/sso/embed?${mobileParams.toString()}`;

    // Native (in-app browser) flow: NOT an iframe, so do NOT use embedWidget/embed.
    // Using embed mode here causes CAS to hang on the post-MFA logintoken handoff
    // and never redirect to the `service` URL with a ticket.
    const nativeParams = new URLSearchParams({
      service: nativeServiceUrl,
      webhost: "https://sso.garmin.com",
      source: nativeServiceUrl,
      redirectAfterAccountLoginUrl: nativeServiceUrl,
      redirectAfterAccountCreationUrl: nativeServiceUrl,
      gauthHost: "https://sso.garmin.com/sso",
      locale: "en_US",
      id: "gauth-widget",
      cssUrl: "https://static.garmincdn.com/com.garmin.connect/ui/css/gauth-custom-v1.2-min.css",
      privacyStatementUrl: "https://www.garmin.com/en-US/privacy/connect/",
      clientId: "GarminConnect",
      rememberMeShown: "true",
      rememberMeChecked: "false",
      createAccountShown: "true",
      openCreateAccount: "false",
      displayNameShown: "false",
      consumeServiceTicket: "false",
      initialFocus: "true",
      generateExtraServiceTicket: "true",
      generateTwoExtraServiceTickets: "false",
      generateNoServiceTicket: "false",
      globalOptInShown: "true",
      globalOptInChecked: "false",
      mobile: "true",
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

    const nativeUrl = `https://sso.garmin.com/sso/signin?${nativeParams.toString()}`;

    return new Response(JSON.stringify({ url, callback, mobile_embed_url: mobileEmbedUrl, service_url: serviceUrl, native_url: nativeUrl, native_service_url: nativeServiceUrl }), {
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
