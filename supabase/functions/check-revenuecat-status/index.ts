import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } =
      await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");
    if (!rcSecretKey) {
      console.error("REVENUECAT_SECRET_KEY not set");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const rcResponse = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${rcSecretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!rcResponse.ok) {
      if (rcResponse.status === 404) {
        return new Response(
          JSON.stringify({ isPremium: false, synced: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("RevenueCat API error:", rcResponse.status, await rcResponse.text());
      return new Response(
        JSON.stringify({ error: "Failed to check subscription status" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const rcData = await rcResponse.json();
    const entitlements = rcData?.subscriber?.entitlements || {};

    // Check for "premium" entitlement specifically
    const premiumEntitlement = entitlements["premium"];
    let isActive = false;
    let expiresAt: string | null = null;
    let plan: string | null = null;
    let rcEntitlement = "premium";

    if (premiumEntitlement && premiumEntitlement.expires_date) {
      const expDate = new Date(premiumEntitlement.expires_date);
      if (expDate > new Date()) {
        isActive = true;
        expiresAt = premiumEntitlement.expires_date;
        plan = premiumEntitlement.product_identifier || "unknown";
        rcEntitlement = "premium";
      }
    }

    // Also check if premium entitlement has no expiry (lifetime/one-time purchase)
    if (!isActive && premiumEntitlement && !premiumEntitlement.expires_date) {
      isActive = true;
      expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
      plan = premiumEntitlement.product_identifier || "unknown";
      rcEntitlement = "premium";
    }

    // Fallback: check all entitlements for any active one
    if (!isActive) {
      for (const [entName, entitlement] of Object.entries(entitlements) as any) {
        if (entitlement.expires_date) {
          const expDate = new Date(entitlement.expires_date);
          if (expDate > new Date()) {
            isActive = true;
            expiresAt = entitlement.expires_date;
            plan = entitlement.product_identifier || "unknown";
            rcEntitlement = entName;
            break;
          }
        } else {
          // No expiry = lifetime
          isActive = true;
          expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
          plan = entitlement.product_identifier || "unknown";
          rcEntitlement = entName;
          break;
        }
      }
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (isActive && expiresAt && plan) {
      const { error: upsertError } = await serviceClient
        .from("premium_subscriptions")
        .upsert(
          {
            user_id: userId,
            plan,
            activated_at: new Date().toISOString(),
            expires_at: expiresAt,
            rc_entitlement: rcEntitlement,
          },
          { onConflict: "user_id" }
        );

      if (upsertError) {
        console.error("Upsert error:", upsertError);
      }

      return new Response(
        JSON.stringify({ isPremium: true, plan, expiresAt, rcEntitlement, synced: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Not active — clean up stale DB record if exists
    await serviceClient
      .from("premium_subscriptions")
      .delete()
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({ isPremium: false, synced: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
