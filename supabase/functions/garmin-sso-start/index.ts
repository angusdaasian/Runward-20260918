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
    const mobileBridge = `${origin}/garmin-mobile-auth`;
    const nativeCallback = `${origin}/garmin-native-callback.html`;
    const serviceUrl = "https://sso.garmin.com/sso/embed";
    // Use the embed-widget SSO flow. Unlike the bare `clientId=GarminConnect`
    // sign-in (which redirects to Connect's own post-auth landing page after
    // MFA — bypassing our `service` callback), the embed widget flow always
    // redirects back to the `service` URL with `?ticket=ST-...` appended on
    // success, which is exactly what we need to exchange.
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
      embedWidget: "true",
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
      mfaRequired: "false",
      performMFACheck: "false",
      rememberMyBrowserShown: "false",
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

    const nativeParams = new URLSearchParams({
      service: nativeCallback,
      webhost: "https://sso.garmin.com",
      source: nativeCallback,
      redirectAfterAccountLoginUrl: nativeCallback,
      redirectAfterAccountCreationUrl: nativeCallback,
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
      embedWidget: "true",
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
      mfaRequired: "false",
      performMFACheck: "false",
      rememberMyBrowserShown: "false",
      rememberMyBrowserChecked: "false",
    });

    const nativeUrl = `https://sso.garmin.com/sso/signin?${nativeParams.toString()}`;

    return new Response(JSON.stringify({ url, callback, mobile_embed_url: mobileEmbedUrl, service_url: serviceUrl, native_url: nativeUrl, native_service_url: nativeCallback }), {
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
