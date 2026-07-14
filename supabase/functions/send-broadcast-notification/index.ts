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
    const message = (body?.message ?? body?.body ?? "").toString().trim();
    const rawAudience = typeof body?.audience === "string" ? body.audience.trim() : "";
    const audience: "all" | "free" | "free_no_trial_this_month" | "premium" | null =
      rawAudience === "all" ? "all"
      : rawAudience === "free" ? "free"
      : rawAudience === "free_no_trial_this_month" ? "free_no_trial_this_month"
      : rawAudience === "premium" ? "premium"
      : null;
    const rawLang = typeof body?.lang === "string" ? body.lang : body?.langFilter;
    const langFilter: "en" | "zh" | null =
      rawLang === "en" ? "en" : rawLang === "zh" ? "zh" : null;
    const platformFilter: "ios" | "android" | null =
      body?.platform === "ios" ? "ios" : body?.platform === "android" ? "android" : null;
    const dryRun = body?.dry_run === true;
    const testUserId: string | null =
      typeof body?.test_user_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.test_user_id)
        ? body.test_user_id
        : null;
    const selfUnschedule: string | null =
      typeof body?.self_unschedule === "string" && body.self_unschedule.length > 0
        ? body.self_unschedule
        : null;

    if (!audience) {
      return new Response(JSON.stringify({ error: "valid audience required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((rawLang || body?.langFilter) && !langFilter) {
      return new Response(JSON.stringify({ error: "valid lang required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body?.test_user_id && !testUserId) {
      return new Response(JSON.stringify({ error: "valid test_user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    let profileQuery = supabase.from("profiles").select("user_id, lang, is_premium");
    if (langFilter) profileQuery = profileQuery.eq("lang", langFilter);
    if (testUserId) profileQuery = profileQuery.eq("user_id", testUserId);
    const { data: profiles, error: pErr } = await profileQuery;
    if (pErr) throw pErr;
    const afterLangCount = (profiles || []).length;

    // Belt-and-suspenders lang filter: reject any row whose lang doesn't match,
    // in case the DB query somehow returned unfiltered results.
    let scoped = (profiles || []).filter((p: any) => {
      if (!p?.user_id) return false;
      if (langFilter && p.lang !== langFilter) return false;
      return true;
    });
    let userIds: string[] = scoped.map((p: any) => p.user_id);

    if (audience === "free" || audience === "free_no_trial_this_month" || audience === "premium") {
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

      // Belt-and-suspenders: also treat profiles.is_premium=true as premium,
      // so a stale/missing premium_subscriptions row can't leak a paid user
      // into a "free" broadcast.
      const isPremiumFlagged = new Set(
        scoped.filter((p: any) => p.is_premium === true).map((p: any) => p.user_id),
      );
      const premiumUnion = new Set<string>([...activePremium, ...isPremiumFlagged]);

      if (audience === "premium") {
        userIds = userIds.filter((id) => premiumUnion.has(id));
      } else {
        userIds = userIds.filter((id) => !premiumUnion.has(id));
      }

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

      // Hard guard: if a "free"-style broadcast somehow ends up with a recipient
      // list that still contains every language-scoped profile, that's a filter
      // regression — refuse to send rather than blast paid users again.
      if (!testUserId && userIds.length >= afterLangCount && afterLangCount > 0) {
        console.error(
          `[send-broadcast-notification] REFUSED: audience=${audience} produced ${userIds.length} recipients out of ${afterLangCount} scoped profiles — premium filter appears to have failed.`,
        );
        return new Response(
          JSON.stringify({
            error: "safety_check_failed",
            reason: "premium_filter_did_not_reduce_recipients",
            audience,
            lang: langFilter,
            scoped_profiles: afterLangCount,
            recipients: userIds.length,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    console.log(
      `[send-broadcast-notification] audience=${audience} lang=${langFilter ?? "any"} platform=${platformFilter ?? "any"} test_user=${testUserId ?? "none"} dry_run=${dryRun} scoped_profiles=${afterLangCount} recipients=${userIds.length}`,
    );

    if (dryRun) {
      return new Response(
        JSON.stringify({ ok: true, dry_run: true, audience, lang: langFilter, platform: platformFilter, test_user_id: testUserId, recipients: userIds.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Chunk to respect OneSignal include_external_user_ids limit (~2000)
    const CHUNK = 2000;
    let sent = 0;
    const errors: string[] = [];
    for (let i = 0; i < userIds.length; i += CHUNK) {
      const chunk = userIds.slice(i, i + CHUNK);
      const payload: Record<string, unknown> = {
        app_id: onesignalAppId,
        include_external_user_ids: chunk,
        headings: { en: title, zh: title, "zh-Hant": title },
        contents: { en: message, zh: message, "zh-Hant": message },
      };
      if (platformFilter) {
        payload.filters = [
          { field: "device_type", relation: "=", value: platformFilter === "ios" ? "0" : "1" },
        ];
      }
      const resp = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${onesignalApiKey}`,
        },
        body: JSON.stringify(payload),
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
