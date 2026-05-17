import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Events that grant/update access
const ACTIVE_EVENTS = [
  "INITIAL_PURCHASE", // New subscription or one-time purchase
  "NON_RENEWING_PURCHASE", // One-time (consumable/non-consumable) purchase
  "RENEWAL", // Subscription renewed
  "UNCANCELLATION", // User resubscribed before expiry
  "SUBSCRIPTION_EXTENDED", // Subscription extended (e.g. support grant)
  "PRODUCT_CHANGE", // Plan change (upgrade/downgrade/crossgrade)
];

// Events that revoke access
const INACTIVE_EVENTS = ["EXPIRATION", "BILLING_ISSUE"];

// Events we log but don't act on (cancellation means auto-renew off, NOT immediate revocation)
const LOG_ONLY_EVENTS = [
  "CANCELLATION", // Auto-renew turned off; access continues until expiration
  "SUBSCRIBER_ALIAS",
  "TRANSFER",
  "INVOICE_ISSUANCE",
];

const WEBHOOK_AUTH_KEY = Deno.env.get("WEBHOOK_AUTH_KEY");

// Admin user to notify on subscription events
const ADMIN_NOTIFY_USER_ID = "c7a7d1ca-c7bf-4288-bb9d-794006a04087";

async function notifyAdmin(title: string, message: string) {
  try {
    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!appId || !apiKey) {
      console.warn("[notifyAdmin] OneSignal not configured");
      return;
    }
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [ADMIN_NOTIFY_USER_ID],
        headings: { en: title },
        contents: { en: message },
      }),
    });
    const json = await res.json().catch(() => ({}));
    console.log("[notifyAdmin] OneSignal response:", JSON.stringify(json));
  } catch (e) {
    console.error("[notifyAdmin] error:", e);
  }
}

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

    // Log full event payload for debugging
    console.log("RC event payload:", JSON.stringify(event));

    if (!event) {
      return new Response(JSON.stringify({ error: "No event data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventType: string = event.type;
    const appUserId: string | undefined = event.app_user_id;
    const originalAppUserId: string | undefined = event.original_app_user_id;
    const aliases: string[] = Array.isArray(event.aliases) ? event.aliases : [];
    const productId: string | undefined = event.product_id;
    const purchasedAtMs: number | undefined = event.purchased_at_ms;
    const expirationAtMs: number | undefined = event.expiration_at_ms;
    const periodType: string | undefined = event.period_type;
    const isTrialPeriod: boolean =
      event.is_trial_period === true ||
      event.is_trial_period === "true" ||
      periodType === "TRIAL" ||
      periodType === "trial" ||
      periodType === "INTRO";
    const entitlementIds: string[] = event.entitlement_ids || [];
    const newProductId: string | undefined = event.new_product_id;
    const price: number | undefined = typeof event.price === "number" ? event.price : undefined;
    const currency: string | undefined = event.currency;
    const priceInPurchased: number | undefined =
      typeof event.price_in_purchased_currency === "number" ? event.price_in_purchased_currency : undefined;
    const purchasedCurrency: string | undefined = event.currency;
    const formatPrice = () => {
      if (priceInPurchased !== undefined && purchasedCurrency) {
        return `${priceInPurchased.toFixed(2)} ${purchasedCurrency}`;
      }
      if (price !== undefined && currency) {
        return `${price.toFixed(2)} ${currency} (USD est.)`;
      }
      return "n/a";
    };

    if (!appUserId) {
      return new Response(JSON.stringify({ error: "No app_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve canonical user_id from candidates (app_user_id, original, aliases)
    const candidates = Array.from(
      new Set(
        [appUserId, originalAppUserId, ...aliases].filter(
          (id): id is string => !!id && !id.startsWith("$RCAnonymousID:"),
        ),
      ),
    );

    let resolvedUserId: string | null = null;
    for (const candidate of candidates) {
      // UUID shape check
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) continue;
      const { data: prof } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", candidate)
        .maybeSingle();
      if (prof?.user_id) {
        resolvedUserId = prof.user_id;
        break;
      }
    }

    console.log(
      `RC webhook: type=${eventType}, app_user_id=${appUserId}, aliases=${JSON.stringify(aliases)}, resolved=${resolvedUserId}, product=${productId}, period=${periodType}, trial=${isTrialPeriod}`,
    );

    if (eventType === "TEST") {
      console.log("RevenueCat test webhook received (no DB action)");
      return new Response(JSON.stringify({ received: true, test: true, candidates, resolvedUserId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!resolvedUserId) {
      console.warn(`No matching Supabase user for RC candidates: ${JSON.stringify(candidates)}`);
      return new Response(JSON.stringify({ received: true, skipped: "no_matching_user", candidates }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUserId = resolvedUserId;

    if (ACTIVE_EVENTS.includes(eventType)) {
      const activatedAt = purchasedAtMs ? new Date(purchasedAtMs).toISOString() : new Date().toISOString();

      // For one-time purchases, there may be no expiration — set far future
      const expiresAt = expirationAtMs
        ? new Date(expirationAtMs).toISOString()
        : new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(); // ~100 years for lifetime

      // Use the new product ID for PRODUCT_CHANGE, otherwise current product
      const effectiveProductId = eventType === "PRODUCT_CHANGE" && newProductId ? newProductId : productId || "unknown";

      // Determine entitlement — use first from entitlement_ids, default to "premium"
      const rcEntitlement = entitlementIds.length > 0 ? entitlementIds[0] : "premium";

      // NOTE: We deliberately do NOT revoke other users who share the same plan
      // (product_id). Many users can legitimately hold the same monthly/annual
      // SKU at the same time. Real "transfers" come through the TRANSFER event
      // (handled in LOG_ONLY_EVENTS / future TRANSFER logic) and are tied to
      // original_transaction_id, NOT product_id. The previous logic here was
      // wiping every existing subscriber to the same SKU on every new purchase.

      const { error } = await supabase.from("premium_subscriptions").upsert(
        {
          user_id: targetUserId,
          plan: effectiveProductId,
          activated_at: activatedAt,
          expires_at: expiresAt,
          is_trial: isTrialPeriod,
          rc_entitlement: rcEntitlement,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (error) {
        console.error("Upsert error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sync profiles.is_premium
      await supabase.from("profiles").update({ is_premium: true }).eq("user_id", targetUserId);

      console.log(
        `Subscription activated: user=${targetUserId}, plan=${effectiveProductId}, entitlement=${rcEntitlement}, trial=${isTrialPeriod}, event=${eventType}`,
      );

      await notifyAdmin(
        `RC: ${eventType}${isTrialPeriod ? " (trial)" : ""}`,
        `User ${targetUserId}\nPlan: ${effectiveProductId}\nPrice: ${formatPrice()}`,
      );
    } else if (INACTIVE_EVENTS.includes(eventType)) {
      // EXPIRATION and BILLING_ISSUE = access should be revoked
      const { error } = await supabase.from("premium_subscriptions").delete().eq("user_id", targetUserId);

      if (error) {
        console.error("Delete error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sync profiles.is_premium
      await supabase.from("profiles").update({ is_premium: false }).eq("user_id", targetUserId);

      console.log(`Subscription removed: user=${targetUserId}, event=${eventType}`);
    } else if (LOG_ONLY_EVENTS.includes(eventType)) {
      console.log(`Logged event (no action): user=${targetUserId}, event=${eventType}`);
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
