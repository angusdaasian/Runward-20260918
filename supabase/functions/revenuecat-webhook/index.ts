import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Events that grant/update access
const ACTIVE_EVENTS = [
  "INITIAL_PURCHASE",        // New subscription or one-time purchase
  "NON_RENEWING_PURCHASE",   // One-time (consumable/non-consumable) purchase
  "RENEWAL",                 // Subscription renewed
  "UNCANCELLATION",          // User resubscribed before expiry
  "SUBSCRIPTION_EXTENDED",   // Subscription extended (e.g. support grant)
  "PRODUCT_CHANGE",          // Plan change (upgrade/downgrade/crossgrade)
];

// Events that revoke access
const INACTIVE_EVENTS = [
  "EXPIRATION",
  "BILLING_ISSUE",
];

// Events we log but don't act on (cancellation means auto-renew off, NOT immediate revocation)
const LOG_ONLY_EVENTS = [
  "CANCELLATION",            // Auto-renew turned off; access continues until expiration
  "SUBSCRIBER_ALIAS",
  "TRANSFER",
  "INVOICE_ISSUANCE",
];

const WEBHOOK_AUTH_KEY = Deno.env.get("WEBHOOK_AUTH_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook authenticity via custom header
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== WEBHOOK_AUTH_KEY) {
      console.error("Invalid webhook auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const event = body?.event;

    if (!event) {
      return new Response(JSON.stringify({ error: "No event data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventType: string = event.type;
    const appUserId: string | undefined = event.app_user_id;
    const productId: string | undefined = event.product_id;
    const purchasedAtMs: number | undefined = event.purchased_at_ms;
    const expirationAtMs: number | undefined = event.expiration_at_ms;
    const isTrialPeriod: boolean = event.is_trial_period === true || event.is_trial_period === "true";
    const entitlementIds: string[] = event.entitlement_ids || [];
    // For PRODUCT_CHANGE, the new product info
    const newProductId: string | undefined = event.new_product_id;

    console.log(`RevenueCat webhook: type=${eventType}, app_user_id=${appUserId}, product=${productId}, entitlements=${JSON.stringify(entitlementIds)}`);

    if (!appUserId) {
      return new Response(JSON.stringify({ error: "No app_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip anonymous RevenueCat IDs
    if (appUserId.startsWith("$RCAnonymousID:")) {
      console.log(`Skipping anonymous user: ${appUserId}`);
      return new Response(JSON.stringify({ received: true, skipped: "anonymous_user" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (ACTIVE_EVENTS.includes(eventType)) {
      const activatedAt = purchasedAtMs
        ? new Date(purchasedAtMs).toISOString()
        : new Date().toISOString();

      // For one-time purchases, there may be no expiration — set far future
      const expiresAt = expirationAtMs
        ? new Date(expirationAtMs).toISOString()
        : new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(); // ~100 years for lifetime

      // Use the new product ID for PRODUCT_CHANGE, otherwise current product
      const effectiveProductId = (eventType === "PRODUCT_CHANGE" && newProductId) 
        ? newProductId 
        : (productId || "unknown");

      // Determine entitlement — use first from entitlement_ids, default to "premium"
      const rcEntitlement = entitlementIds.length > 0 ? entitlementIds[0] : "premium";

      const { error } = await supabase
        .from("premium_subscriptions")
        .upsert(
          {
            user_id: appUserId,
            plan: effectiveProductId,
            activated_at: activatedAt,
            expires_at: expiresAt,
            is_trial: isTrialPeriod,
            rc_entitlement: rcEntitlement,
            created_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) {
        console.error("Upsert error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Subscription activated: user=${appUserId}, plan=${effectiveProductId}, entitlement=${rcEntitlement}, trial=${isTrialPeriod}, event=${eventType}`);
    } else if (INACTIVE_EVENTS.includes(eventType)) {
      // EXPIRATION and BILLING_ISSUE = access should be revoked
      const { error } = await supabase
        .from("premium_subscriptions")
        .delete()
        .eq("user_id", appUserId);

      if (error) {
        console.error("Delete error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Subscription removed: user=${appUserId}, event=${eventType}`);
    } else if (LOG_ONLY_EVENTS.includes(eventType)) {
      // CANCELLATION: auto-renew off but access continues until expires_at
      // We do NOT delete — the EXPIRATION event will handle actual revocation
      console.log(`Logged event (no action): user=${appUserId}, event=${eventType}`);
    } else if (eventType === "TEST") {
      console.log("RevenueCat test webhook received");
    } else {
      console.log(`Unhandled event type: ${eventType}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
