import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
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
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rcResponse = await fetch(`https://api.revenuecat.com/v1/subscribers/${userId}`, {
      headers: {
        Authorization: `Bearer ${rcSecretKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!rcResponse.ok) {
      if (rcResponse.status === 404) {
        // Unknown to RC — DO NOT delete local row (might be a webhook-granted promo)
        return new Response(JSON.stringify({ isPremium: false, synced: false, reason: "not_in_rc" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("RevenueCat API error:", rcResponse.status, await rcResponse.text());
      return new Response(JSON.stringify({ error: "Failed to check subscription status" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rcData = await rcResponse.json();
    const subscriber = rcData?.subscriber || {};
    const entitlements = subscriber.entitlements || {};
    const subscriptions = subscriber.subscriptions || {};

    console.log(
      `RC subscriber for ${userId}: entitlements=${JSON.stringify(Object.keys(entitlements))}, subscriptions=${JSON.stringify(
        Object.entries(subscriptions).map(([k, v]: any) => ({
          k,
          period_type: v?.period_type,
          expires_date: v?.expires_date,
        })),
      )}`,
    );

    const now = new Date();
    let isActive = false;
    let isTrial = false;
    let expiresAt: string | null = null;
    let plan: string | null = null;
    let rcEntitlement = "premium";

    // 1. Check "premium" entitlement
    const premiumEntitlement = entitlements["premium"];
    if (premiumEntitlement) {
      if (premiumEntitlement.expires_date) {
        const expDate = new Date(premiumEntitlement.expires_date);
        if (expDate > now) {
          isActive = true;
          expiresAt = premiumEntitlement.expires_date;
          plan = premiumEntitlement.product_identifier || "unknown";
          rcEntitlement = "premium";
        }
      } else {
        // Lifetime
        isActive = true;
        expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
        plan = premiumEntitlement.product_identifier || "unknown";
        rcEntitlement = "premium";
      }
    }

    // 2. Any other entitlement
    if (!isActive) {
      for (const [entName, entitlement] of Object.entries(entitlements) as any) {
        if (entitlement.expires_date) {
          const expDate = new Date(entitlement.expires_date);
          if (expDate > now) {
            isActive = true;
            expiresAt = entitlement.expires_date;
            plan = entitlement.product_identifier || "unknown";
            rcEntitlement = entName;
            break;
          }
        } else {
          isActive = true;
          expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
          plan = entitlement.product_identifier || "unknown";
          rcEntitlement = entName;
          break;
        }
      }
    }

    // 3. Fallback to subscriptions map (covers promo trials with no entitlement mapping)
    if (!isActive) {
      for (const [productId, sub] of Object.entries(subscriptions) as any) {
        if (sub?.expires_date) {
          const expDate = new Date(sub.expires_date);
          if (expDate > now) {
            isActive = true;
            expiresAt = sub.expires_date;
            plan = productId;
            rcEntitlement = "premium";
            const pt = String(sub.period_type || "").toLowerCase();
            isTrial = pt === "trial" || pt === "intro";
            console.log(`Subscriptions-map fallback matched: product=${productId}, period_type=${sub.period_type}`);
            break;
          }
        }
      }
    } else {
      // We matched via entitlement; mark trial if the linked subscription says so
      if (plan && subscriptions[plan]) {
        const pt = String(subscriptions[plan].period_type || "").toLowerCase();
        isTrial = pt === "trial" || pt === "intro";
      }
    }

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (isActive && expiresAt && plan) {
      // SAFE behavior: only ever upsert the CURRENT user's row.
      // Never touch other users — RevenueCat webhook is the source of truth
      // for transfers and revocations, not this read-only check.
      const { error: upsertError } = await serviceClient.from("premium_subscriptions").upsert(
        {
          user_id: userId,
          plan,
          activated_at: new Date().toISOString(),
          expires_at: expiresAt,
          is_trial: isTrial,
          rc_entitlement: rcEntitlement,
        },
        { onConflict: "user_id" },
      );

      if (upsertError) {
        console.error("Upsert error:", upsertError);
      }

      await serviceClient.from("profiles").update({ is_premium: true }).eq("user_id", userId);

      return new Response(
        JSON.stringify({ isPremium: true, plan, expiresAt, rcEntitlement, isTrial, synced: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Not active per RC. We DO NOT revoke from this endpoint anymore.
    // Reasons:
    //  - Promo/code-issued subscriptions (LCRA, code_annual, admin grants) are
    //    not visible in the RevenueCat subscriber payload, so an "all expired"
    //    response from RC says nothing about their validity.
    //  - The RevenueCat webhook is the authoritative source for revocations
    //    (CANCELLATION / EXPIRATION events) and already updates the DB.
    //  - Transient RC API hiccups have caused false "all_expired" reads.
    // If the local DB still has a valid row, fall back to it; otherwise report not premium.
    const { data: localSub } = await serviceClient
      .from("premium_subscriptions")
      .select("plan, expires_at, is_trial, rc_entitlement")
      .eq("user_id", userId)
      .maybeSingle();

    if (localSub && new Date(localSub.expires_at) > now) {
      console.log(`RC inactive for ${userId} but local DB has valid subscription; preserving it`);
      return new Response(
        JSON.stringify({
          isPremium: true,
          plan: localSub.plan,
          expiresAt: localSub.expires_at,
          rcEntitlement: localSub.rc_entitlement,
          isTrial: localSub.is_trial,
          synced: false,
          reason: "rc_inactive_db_valid",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`No active subscription for ${userId} (RC inactive, no valid DB row)`);
    return new Response(JSON.stringify({ isPremium: false, synced: false, reason: "no_active_subscription" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });


      const { error: upsertError } = await serviceClient.from("premium_subscriptions").upsert(
        {
          user_id: userId,
          plan,
          activated_at: new Date().toISOString(),
          expires_at: expiresAt,
          is_trial: isTrial,
          rc_entitlement: rcEntitlement,
        },
        { onConflict: "user_id" },
      );

      if (upsertError) {
        console.error("Upsert error:", upsertError);
      }

      await serviceClient.from("profiles").update({ is_premium: true }).eq("user_id", userId);

      return new Response(
        JSON.stringify({ isPremium: true, plan, expiresAt, rcEntitlement, isTrial, synced: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Not active per RC. Only revoke if RC ACTUALLY shows everything expired.
    // If entitlements + subscriptions are both empty, it's likely an unmapped promo —
    // do NOT wipe the local row (the webhook is the source of truth for revocation).
    const hasAnyData = Object.keys(entitlements).length > 0 || Object.keys(subscriptions).length > 0;

    if (hasAnyData) {
      // RC returned data but nothing is active → safe to revoke
      await serviceClient.from("premium_subscriptions").delete().eq("user_id", userId);
      await serviceClient.from("profiles").update({ is_premium: false }).eq("user_id", userId);
      console.log(`Revoked premium for ${userId}: RC reports all expired`);
      return new Response(JSON.stringify({ isPremium: false, synced: true, reason: "all_expired" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Empty payload — leave DB alone, fall back to whatever the webhook set
    console.log(`Empty RC payload for ${userId} — preserving local DB state`);
    return new Response(JSON.stringify({ isPremium: false, synced: false, reason: "empty_rc_payload" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
