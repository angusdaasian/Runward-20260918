import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const DECAY_RATE = 50; // XP per day
const DECAY_THRESHOLD_DAYS = 3;

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const thresholdDate = new Date(now.getTime() - DECAY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    // Get users who haven't logged in for > 3 days and have XP > 0
    const { data: users, error } = await supabase
      .from("profiles")
      .select("user_id, monthly_xp, last_login")
      .gt("monthly_xp", 0)
      .lt("last_login", thresholdDate.toISOString());

    if (error) throw error;

    let updated = 0;
    for (const user of users || []) {
      const lastLogin = new Date(user.last_login);
      const daysSince = Math.floor((now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24));
      const decayDays = daysSince - DECAY_THRESHOLD_DAYS;
      if (decayDays <= 0) continue;

      const decay = Math.min(user.monthly_xp, decayDays * DECAY_RATE);
      const newXp = Math.max(0, user.monthly_xp - decay);

      await supabase
        .from("profiles")
        .update({ monthly_xp: newXp })
        .eq("user_id", user.user_id);

      updated++;
    }

    return new Response(JSON.stringify({ success: true, updated }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
