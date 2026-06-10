// One-shot migration: split Interval workout days in existing training_plans.plan_data
// into separate Warmup + Intervals + Cooldown sessions. Idempotent — days already containing
// a sessions[] array are left untouched.
//
// Usage: POST with optional { user_id?: string, dry_run?: boolean }.
// - Without user_id: scans every training_plans row (admin only).
// - With user_id: only that user's plans (the user themselves OR an admin).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { splitIntervalsInPlan } from "../_shared/splitIntervalSessions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = (claimsData.claims as any).sub as string;

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | null = typeof body?.user_id === "string" ? body.user_id : null;
    const dryRun: boolean = !!body?.dry_run;

    const admin = createClient(supabaseUrl, serviceKey);
    let scope = targetUserId ?? callerId;
    if (targetUserId && targetUserId !== callerId) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      scope = targetUserId;
    }
    // Allow admins to migrate ALL users when they omit user_id.
    const wantsAll = !targetUserId;
    if (wantsAll) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
      if (!isAdmin) {
        // Non-admins can only migrate their own plans.
        scope = callerId;
      } else {
        scope = "__ALL__";
      }
    }

    let query = admin.from("training_plans").select("id, user_id, plan_data, lang");
    if (scope !== "__ALL__") query = query.eq("user_id", scope);
    const { data: rows, error: selErr } = await query;
    if (selErr) throw selErr;

    let touchedRows = 0;
    let totalDaysSplit = 0;
    const updates: Promise<any>[] = [];

    for (const row of rows ?? []) {
      const lang = (row as any).lang === "zh" ? "zh" : "en";
      const { plan, changed } = splitIntervalsInPlan((row as any).plan_data, { lang });
      if (changed > 0) {
        touchedRows++;
        totalDaysSplit += changed;
        if (!dryRun) {
          updates.push(
            admin.from("training_plans").update({ plan_data: plan }).eq("id", (row as any).id),
          );
        }
      }
    }

    if (!dryRun && updates.length > 0) {
      const results = await Promise.all(updates);
      const failed = results.filter((r: any) => r?.error);
      if (failed.length > 0) {
        console.error("migrate-interval-sessions partial failure:", failed.map((r: any) => r.error));
      }
    }

    return new Response(
      JSON.stringify({
        scanned_rows: rows?.length ?? 0,
        rows_updated: touchedRows,
        interval_days_split: totalDaysSplit,
        dry_run: dryRun,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("migrate-interval-sessions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
