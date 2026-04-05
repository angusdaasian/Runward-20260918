import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function generatePromoCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RW-";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

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

    // Generate promo codes for winners
    const rewards = winners.map((w) => ({
      user_id: w.user_id,
      month_year: monthYear,
      promo_code: generatePromoCode(),
    }));

    if (rewards.length > 0) {
      const { error: insertErr } = await supabase
        .from("season_rewards")
        .upsert(rewards, { onConflict: "user_id,month_year" });
      if (insertErr) console.error("Insert rewards error:", insertErr);
    }

    // Reset all monthly_xp to 0 and update rank tiers
    const { error: resetErr } = await supabase
      .from("profiles")
      .update({ monthly_xp: 0, rank_tier: "Bronze", division: "V" })
      .gt("monthly_xp", -1); // update all

    if (resetErr) console.error("Reset error:", resetErr);

    return new Response(
      JSON.stringify({ success: true, rewards_given: rewards.length, month: monthYear }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
