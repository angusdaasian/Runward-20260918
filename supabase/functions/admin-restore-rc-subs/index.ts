// One-shot admin tool: re-sync premium_subscriptions from RevenueCat for a list
// of user_ids that were wrongly wiped by the old "same-plan revoke" bug.
// Caller must be authenticated AND have the admin role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(SUPABASE_URL, SVC);
    const { data: roleRow } = await svc
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const userIds: string[] = Array.isArray(body?.userIds) ? body.userIds : [];
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ error: "userIds required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RC_KEY = Deno.env.get("REVENUECAT_SECRET_KEY")!;
    const now = new Date();
    const results: any[] = [];

    for (const uid of userIds) {
      const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${uid}`, {
        headers: { Authorization: `Bearer ${RC_KEY}` },
      });
      if (!r.ok) {
        results.push({ uid, status: "rc_error", code: r.status });
        continue;
      }
      const d = await r.json();
      const sub = d?.subscriber || {};
      const ents = sub.entitlements || {};
      const subs = sub.subscriptions || {};

      let isActive = false, expiresAt: string | null = null, plan: string | null = null;
      let rcEnt = "premium", isTrial = false;

      const prem = ents["premium"];
      if (prem) {
        if (prem.expires_date) {
          if (new Date(prem.expires_date) > now) {
            isActive = true; expiresAt = prem.expires_date;
            plan = prem.product_identifier || "unknown"; rcEnt = "premium";
          }
        } else {
          isActive = true; plan = prem.product_identifier || "unknown";
          expiresAt = new Date(Date.now() + 100 * 365 * 86400000).toISOString();
        }
      }
      if (!isActive) {
        for (const [name, e] of Object.entries(ents) as any) {
          if (e.expires_date && new Date(e.expires_date) > now) {
            isActive = true; expiresAt = e.expires_date;
            plan = e.product_identifier || "unknown"; rcEnt = name; break;
          } else if (!e.expires_date) {
            isActive = true; plan = e.product_identifier || "unknown";
            expiresAt = new Date(Date.now() + 100 * 365 * 86400000).toISOString();
            rcEnt = name; break;
          }
        }
      }
      if (!isActive) {
        for (const [pid, s] of Object.entries(subs) as any) {
          if (s?.expires_date && new Date(s.expires_date) > now) {
            isActive = true; expiresAt = s.expires_date; plan = pid; rcEnt = "premium";
            const pt = String(s.period_type || "").toLowerCase();
            isTrial = pt === "trial" || pt === "intro";
            break;
          }
        }
      } else if (plan && subs[plan]) {
        const pt = String(subs[plan].period_type || "").toLowerCase();
        isTrial = pt === "trial" || pt === "intro";
      }

      if (isActive && plan && expiresAt) {
        await svc.from("premium_subscriptions").upsert(
          {
            user_id: uid, plan, activated_at: new Date().toISOString(),
            expires_at: expiresAt, is_trial: isTrial, rc_entitlement: rcEnt,
          },
          { onConflict: "user_id" },
        );
        await svc.from("profiles").update({ is_premium: true }).eq("user_id", uid);
        results.push({ uid, status: "restored", plan, isTrial, expiresAt });
      } else {
        results.push({
          uid, status: "not_active",
          ents: Object.keys(ents), subs: Object.keys(subs),
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
