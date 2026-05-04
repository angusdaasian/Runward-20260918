// Daily morning push notification (08:00 HKT = 00:00 UTC)
// Sends a personalized monthly-progress message via OneSignal to every user
// with activity_notifications = true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MILESTONES_KM = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500];

function nextMilestone(currentKm: number, goalKm: number): number {
  // Next round milestone above current km, capped at goal
  for (const m of MILESTONES_KM) {
    if (m > currentKm && m <= goalKm) return m;
  }
  // Otherwise, next 50km step above current
  const next = Math.ceil((currentKm + 1) / 50) * 50;
  return Math.max(next, Math.ceil(goalKm * 1.25));
}

function buildMessage(opts: {
  lang: "zh" | "en";
  goalKm: number;
  currentKm: number;
}): { title: string; message: string } {
  const { lang, goalKm, currentKm } = opts;
  const remaining = Math.max(0, goalKm - currentKm);
  const goalReached = currentKm >= goalKm;
  const cur = currentKm.toFixed(1);
  const rem = remaining.toFixed(1);

  if (lang === "zh") {
    const title = "準備好跑步了嗎?";
    if (goalReached) {
      const nm = nextMilestone(currentKm, goalKm);
      const toNext = Math.max(0, nm - currentKm).toFixed(1);
      return {
        title,
        message: `你今個月已經跑左 ${cur} km，但如果你再跑多 ${toNext} km，就可以向下一個里程碑 ${nm} km 進發，仲唔突破自己？🏃‍♂️🔥`,
      };
    }
    return {
      title,
      message: `距離你今個月嘅 ${goalKm}km 目標仲差 ${rem} km 咋！拿拿臨出去跑返轉，向目標再邁進一步！🏃‍♂️🔥`,
    };
  }

  // English
  const title = "Ready to run today?";
  if (goalReached) {
    const nm = nextMilestone(currentKm, goalKm);
    const toNext = Math.max(0, nm - currentKm).toFixed(1);
    return {
      title,
      message: `You've already run ${cur} km this month — just ${toNext} km more to hit the next milestone of ${nm} km. Push past your limits! 🏃‍♂️🔥`,
    };
  }
  return {
    title,
    message: `You're ${rem} km away from your ${goalKm} km monthly goal! Get out there and take one more step toward it! 🏃‍♂️🔥`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!onesignalAppId || !onesignalApiKey) {
      return new Response(JSON.stringify({ error: "OneSignal not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch all opted-in profiles
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("user_id, monthly_goal_km, activity_notifications")
      .eq("activity_notifications", true);
    if (profilesErr) throw profilesErr;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0, skipped: 0, message: "No opted-in users" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Build month boundary (UTC — close enough to HKT for monthly aggregation)
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    // 3. Fetch month activities for all users in pages (avoid huge .in() URL
    //    and the default 1000-row PostgREST limit).
    const optedInSet = new Set(profiles.map((p: any) => p.user_id));
    const kmByUser = new Map<string, number>();
    const add = (uid: string, meters: number) => {
      if (!meters || meters <= 0) return;
      if (!optedInSet.has(uid)) return;
      kmByUser.set(uid, (kmByUser.get(uid) ?? 0) + meters / 1000);
    };

    const PAGE = 1000;
    async function pageFetch(table: string, distanceCol: string, dateCol: string) {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select(`user_id, ${distanceCol}, ${dateCol}`)
          .gte(dateCol, monthStart)
          .range(from, from + PAGE - 1);
        if (error) {
          console.error(`[daily-push] ${table} fetch err`, error);
          return;
        }
        const rows = data ?? [];
        for (const r of rows as any[]) add(r.user_id, Number(r[distanceCol]) || 0);
        if (rows.length < PAGE) return;
        from += PAGE;
        if (from > 50_000) return; // safety
      }
    }

    await Promise.all([
      pageFetch("strava_activities", "distance", "start_date"),
      pageFetch("apple_health_activities", "distance", "start_date"),
      pageFetch("garmin_activities", "distance_meters", "start_time"),
    ]);

    // 4. Detect each user's preferred language from auth metadata (fallback en)
    // Bulk fetch via admin API in pages
    const langByUser = new Map<string, "zh" | "en">();
    let page = 1;
    while (true) {
      const { data: authPage, error: authErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (authErr) { console.error("[daily-push] listUsers err", authErr); break; }
      const users = authPage?.users ?? [];
      for (const u of users) {
        const meta: any = (u as any).user_metadata ?? {};
        const raw = String(meta.lang ?? meta.language ?? meta.locale ?? "").toLowerCase();
        langByUser.set(u.id, raw.startsWith("zh") ? "zh" : "en");
      }
      if (users.length < 1000) break;
      page += 1;
      if (page > 20) break; // safety
    }

    // 5. Group recipients by (lang, title, message) so we can batch OneSignal calls
    const buckets = new Map<string, { title: string; message: string; ids: string[] }>();
    for (const p of profiles as any[]) {
      const goalKm = Number(p.monthly_goal_km) || 100;
      const currentKm = kmByUser.get(p.user_id) ?? 0;
      const lang = langByUser.get(p.user_id) ?? "en";
      const { title, message } = buildMessage({ lang, goalKm, currentKm });
      const key = `${lang}|${goalKm}|${Math.round(currentKm * 10)}|${title}|${message}`;
      const b = buckets.get(key);
      if (b) b.ids.push(p.user_id);
      else buckets.set(key, { title, message, ids: [p.user_id] });
    }

    // 6. Send each bucket
    let sent = 0;
    let failed = 0;
    for (const b of buckets.values()) {
      try {
        const res = await fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${onesignalApiKey}`,
          },
          body: JSON.stringify({
            app_id: onesignalAppId,
            include_external_user_ids: b.ids,
            headings: { en: b.title },
            contents: { en: b.message },
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          failed += b.ids.length;
          console.error("[daily-push] OneSignal err", res.status, body);
        } else {
          sent += b.ids.length;
        }
      } catch (e) {
        failed += b.ids.length;
        console.error("[daily-push] fetch err", e);
      }
    }

    console.log(`[daily-push] done. sent=${sent} failed=${failed} buckets=${buckets.size}`);
    return new Response(
      JSON.stringify({ sent, failed, buckets: buckets.size, recipients: profiles.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[daily-push] error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
