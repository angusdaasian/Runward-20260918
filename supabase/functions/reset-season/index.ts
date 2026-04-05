import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthYear = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    // Get top 10 premium users
    const { data: premiumTop } = await supabase
      .from("profiles")
      .select("user_id, monthly_xp")
      .eq("is_premium", true)
      .gt("monthly_xp", 0)
      .order("monthly_xp", { ascending: false })
      .limit(10);

    // Get top 3 free users
    const { data: freeTop } = await supabase
      .from("profiles")
      .select("user_id, monthly_xp")
      .eq("is_premium", false)
      .gt("monthly_xp", 0)
      .order("monthly_xp", { ascending: false })
      .limit(3);

    const winners = [...(premiumTop || []), ...(freeTop || [])];
    let codesAssigned = 0;

    // Assign available reward codes to winners
    for (const winner of winners) {
      // Find an unassigned code
      const { data: availableCode } = await supabase
        .from("reward_codes")
        .select("id")
        .eq("is_assigned", false)
        .eq("type", "premium_win")
        .limit(1)
        .single();

      if (!availableCode) break; // No more codes available

      await supabase
        .from("reward_codes")
        .update({
          is_assigned: true,
          user_id: winner.user_id,
          month_year: monthYear,
          assigned_at: new Date().toISOString(),
        })
        .eq("id", availableCode.id);

      codesAssigned++;
    }

    // Reset all monthly_xp to 0 and reset ranks
    await supabase
      .from("profiles")
      .update({ monthly_xp: 0, rank_tier: "Bronze", division: "V" })
      .gt("monthly_xp", -1);

    return new Response(
      JSON.stringify({ success: true, codes_assigned: codesAssigned, month: monthYear }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
