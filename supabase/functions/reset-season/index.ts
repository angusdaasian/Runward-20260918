import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

// Email of the dev/admin account that must be excluded from the leaderboard prizes
const EXCLUDED_EMAILS = ["angchenghk@gmail.com"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: require WEBHOOK_AUTH_KEY in either x-webhook-key header or
    // Authorization: Bearer <key>. This lets pg_cron + admin UI call it
    // without a user JWT, while keeping it private.
    const expectedKey = Deno.env.get("WEBHOOK_AUTH_KEY");
    const providedKey =
      req.headers.get("x-webhook-key") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!expectedKey || providedKey !== expectedKey) {
      console.warn("[reset-season] unauthorized invocation");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Optional override for backfilling a specific month: { month_year: "2026-04" }
    let body: { month_year?: string; dry_run?: boolean } = {};
    try { body = await req.json(); } catch { /* no body */ }

    // Compute "previous month" in HKT (UTC+8) so the season boundary matches
    // the cron schedule (00:00 HKT on the 1st of each month).
    const nowHkt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const lastMonthHkt = new Date(Date.UTC(nowHkt.getUTCFullYear(), nowHkt.getUTCMonth() - 1, 1));
    const monthYear = body.month_year ||
      `${lastMonthHkt.getUTCFullYear()}-${String(lastMonthHkt.getUTCMonth() + 1).padStart(2, "0")}`;
    const dryRun = !!body.dry_run;

    console.log(`[reset-season] start month=${monthYear} dryRun=${dryRun}`);

    // Idempotency: if codes were already assigned for this month, do not re-run.
    const { count: alreadyAssigned } = await supabase
      .from("used_codes")
      .select("id", { count: "exact", head: true })
      .eq("month_year", monthYear);

    if ((alreadyAssigned ?? 0) > 0) {
      console.log(`[reset-season] already processed ${alreadyAssigned} codes for ${monthYear}, skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "already_processed", month: monthYear, codes_assigned: alreadyAssigned }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve excluded user_ids by email
    const { data: excludedUsers } = await supabase
      .from("profiles")
      .select("user_id")
      .in("user_id",
        // we need a sub-select on auth.users — do it via RPC-less workaround:
        // fetch all profiles and filter by email join through a separate query
        []
      );
    // Simpler: query auth via service role using a raw select on users table
    const { data: excludedRows } = await supabase
      .schema("auth")
      .from("users")
      .select("id")
      .in("email", EXCLUDED_EMAILS);
    const excludedIds = new Set((excludedRows || []).map((r: any) => r.id));

    // Top 10 premium
    const { data: premiumTopRaw } = await supabase
      .from("profiles")
      .select("user_id, monthly_xp, display_name")
      .eq("is_premium", true)
      .gt("monthly_xp", 0)
      .order("monthly_xp", { ascending: false })
      .limit(20); // overshoot, we'll filter excluded then slice
    const premiumTop = (premiumTopRaw || []).filter(p => !excludedIds.has(p.user_id)).slice(0, 10);

    // Top 3 free
    const { data: freeTopRaw } = await supabase
      .from("profiles")
      .select("user_id, monthly_xp, display_name")
      .eq("is_premium", false)
      .gt("monthly_xp", 0)
      .order("monthly_xp", { ascending: false })
      .limit(10);
    const freeTop = (freeTopRaw || []).filter(p => !excludedIds.has(p.user_id)).slice(0, 3);

    const winners = [...premiumTop, ...freeTop];
    console.log(`[reset-season] winners=${winners.length} (premium=${premiumTop.length}, free=${freeTop.length})`);

    if (dryRun) {
      return new Response(
        JSON.stringify({ success: true, dry_run: true, month: monthYear, winners }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let codesAssigned = 0;
    const assignments: Array<{ user_id: string; display_name: string | null; code: string }> = [];

    for (const winner of winners) {
      // Find an unassigned code (use maybeSingle so empty doesn't throw)
      const { data: availableCode, error: lookupErr } = await supabase
        .from("reward_codes")
        .select("id, code_string, type")
        .eq("is_assigned", false)
        .eq("type", "premium_win")
        .limit(1)
        .maybeSingle();

      if (lookupErr) {
        console.error("[reset-season] code lookup error:", lookupErr);
        break;
      }
      if (!availableCode) {
        console.warn(`[reset-season] out of codes after ${codesAssigned} assignments`);
        break;
      }

      // Insert into used_codes first
      const { error: insertErr } = await supabase.from("used_codes").insert({
        original_code_id: availableCode.id,
        code_string: availableCode.code_string,
        type: availableCode.type,
        user_id: winner.user_id,
        month_year: monthYear,
        assigned_at: new Date().toISOString(),
      });

      if (insertErr) {
        console.error(`[reset-season] failed to insert used_code for ${winner.user_id}:`, insertErr);
        continue;
      }

      // Then remove from reward_codes pool
      const { error: deleteErr } = await supabase
        .from("reward_codes")
        .delete()
        .eq("id", availableCode.id);

      if (deleteErr) {
        console.error(`[reset-season] failed to delete reward_code ${availableCode.id}:`, deleteErr);
      }

      codesAssigned++;
      assignments.push({
        user_id: winner.user_id,
        display_name: (winner as any).display_name ?? null,
        code: availableCode.code_string,
      });
      console.log(`[reset-season] assigned ${availableCode.code_string} to ${winner.user_id} (${(winner as any).display_name})`);
    }

    // Reset all monthly_xp to 0 and reset ranks (only rows that need it)
    const { error: resetErr } = await supabase
      .from("profiles")
      .update({ monthly_xp: 0, rank_tier: "Bronze", division: "V" })
      .gt("monthly_xp", 0);
    if (resetErr) {
      console.error("[reset-season] xp reset error:", resetErr);
    }

    console.log(`[reset-season] done month=${monthYear} codes_assigned=${codesAssigned}`);

    return new Response(
      JSON.stringify({
        success: true,
        month: monthYear,
        codes_assigned: codesAssigned,
        assignments,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[reset-season] fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
