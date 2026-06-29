import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const webhookKey = Deno.env.get("WEBHOOK_AUTH_KEY");
    if (!webhookKey) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const provided = req.headers.get("x-webhook-key");
    if (provided !== webhookKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({} as any));
    const title = (body?.title ?? "").toString().trim();
    const message = (body?.message ?? "").toString().trim();
    const audience: "all" | "free" | "free_no_trial_this_month" =
      body?.audience === "free" ? "free"
      : body?.audience === "free_no_trial_this_month" ? "free_no_trial_this_month"
      : "all";
    const langFilter: "en" | "zh" | null =
      body?.lang === "en" ? "en" : body?.lang === "zh" ? "zh" : null;
    const selfUnschedule: string | null =
      typeof body?.self_unschedule === "string" && body.self_unschedule.length > 0
        ? body.self_unschedule
        : null;

    if (!title || !message) {
      return new Response(JSON.stringify({ error: "title and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!onesignalAppId || !onesignalApiKey) {
      return new Response(JSON.stringify({ error: "OneSignal not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let profileQuery = supabase.from("profiles").select("user_id, lang");
    if (langFilter) profileQuery = profileQuery.eq("lang", langFilter);
    const { data: profiles, error: pErr } = await profileQuery;
    if (pErr) throw pErr;
    let userIds: string[] = (profiles || []).map((p: any) => p.user_id).filter(Boolean);

    if (audience === "free" || audience === "free_no_trial_this_month") {
      const { data: subs, error: sErr } = await supabase
        .from("premium_subscriptions")
        .select("user_id, expires_at, is_trial, activated_at");
      if (sErr) throw sErr;
      const nowMs = Date.now();
      const activePremium = new Set(
        (subs || [])
          .filter((s: any) => s.expires_at && new Date(s.expires_at).getTime() > nowMs)
          .map((s: any) => s.user_id),
      );
      userIds = userIds.filter((id) => !activePremium.has(id));

      if (audience === "free_no_trial_this_month") {
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
        const trialThisMonth = new Set(
          (subs || [])
            .filter((s: any) => {
              if (!s.is_trial) return false;
              const t = s.activated_at ? new Date(s.activated_at).getTime() : 0;
              return t >= monthStart;
            })
            .map((s: any) => s.user_id),
        );
        userIds = userIds.filter((id) => !trialThisMonth.has(id));
      }
    }

    console.log(`[send-broadcast-notification] audience=${audience} recipients=${userIds.length}`);

    // Chunk to respect OneSignal include_external_user_ids limit (~2000)
    const CHUNK = 2000;
    let sent = 0;
    const errors: string[] = [];
    for (let i = 0; i < userIds.length; i += CHUNK) {
      const chunk = userIds.slice(i, i + CHUNK);
      const resp = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${onesignalApiKey}`,
        },
        body: JSON.stringify({
          app_id: onesignalAppId,
          include_external_user_ids: chunk,
          headings: { en: title, zh: title, "zh-Hant": title },
          contents: { en: message, zh: message, "zh-Hant": message },
        }),
      });
      const json = await resp.json().catch(() => ({}));
      console.log(`[send-broadcast-notification] chunk ${i}: ${resp.status}`, JSON.stringify(json));
      if (resp.ok) sent += chunk.length;
      else errors.push(`chunk ${i}: ${resp.status} ${JSON.stringify(json)}`);
    }

    if (selfUnschedule) {
      try {
        await supabase.rpc("unschedule_cron_job", { job_name: selfUnschedule });
        console.log(`[send-broadcast-notification] unscheduled ${selfUnschedule}`);
      } catch (e) {
        console.error("[send-broadcast-notification] unschedule failed:", e);
      }
    }

    return new Response(
      JSON.stringify({ ok: errors.length === 0, recipients: userIds.length, sent, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[send-broadcast-notification] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
