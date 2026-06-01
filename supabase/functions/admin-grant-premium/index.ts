import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRANTOR_USER_ID = "c7a7d1ca-c7bf-4288-bb9d-794006a04087";

const DURATIONS: Record<string, number> = {
  "1week": 7,
  "2week": 14,
  "1month": 30,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userData.user.id !== GRANTOR_USER_ID) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { targetUserId, duration, secret } = await req.json();
    if (!targetUserId || !duration || !secret) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const grantSecret = Deno.env.get("GRANTINGSECRET");
    if (!grantSecret || secret !== grantSecret) {
      return new Response(JSON.stringify({ error: "Invalid secret" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const days = DURATIONS[duration];
    if (!days) {
      return new Response(JSON.stringify({ error: "Invalid duration" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const plan = `granted_${duration}`;

    // Check existing
    const { data: existing } = await admin
      .from("premium_subscriptions")
      .select("id, expires_at")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (existing) {
      await admin
        .from("premium_subscriptions")
        .update({
          plan,
          expires_at: expiresAt,
          activated_at: new Date().toISOString(),
          is_trial: false,
          rc_entitlement: "admin_granted",
        })
        .eq("id", existing.id);
    } else {
      await admin.from("premium_subscriptions").insert({
        user_id: targetUserId,
        plan,
        expires_at: expiresAt,
        is_trial: false,
        rc_entitlement: "admin_granted",
      });
    }

    await admin.from("profiles").update({ is_premium: true }).eq("user_id", targetUserId);

    return new Response(JSON.stringify({ success: true, expires_at: expiresAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
