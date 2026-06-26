// Daily Terra inactivity sweep — invoked by pg_cron at 16:00 UTC (= 00:00 HKT).
// Dispatches based on the calendar date in Hong Kong time:
//   - Day 1 of the month     → DEAUTH all non-premium Terra connections inactive >= 30 days
//   - Day 30 or 31 (last 1–2 days) of the month → WARN non-premium Terra-connected
//     users who will hit >= 30 days by the 1st (i.e. last_login >= 28 days ago)
//   - Any other day → no-op
//
// First deauth fires on 2026-07-01 HKT. Warnings are gated by WARN_START_HKT
// so they never fire before the first deauth cycle has happened.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const DEAUTH_THRESHOLD = 30;
const WARN_MIN_DAYS = 28; // last 2 days of month: anyone >=28 will hit >=30 by the 1st
const WARN_START_HKT = "2026-07-02"; // no warnings before first deauth cycle completes

function titleCaseProvider(p: string): string {
  if (!p) return "Fitness";
  const lower = p.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Returns { year, month (1-12), day } in HKT for a given UTC instant
function hktDateParts(d: Date) {
  const hkt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return {
    year: hkt.getUTCFullYear(),
    month: hkt.getUTCMonth() + 1,
    day: hkt.getUTCDate(),
    iso: hkt.toISOString().slice(0, 10),
  };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month 1-12 → next month day 0
}

function buildMsg(lang: "zh" | "en", daysInactive: number, provider: string, daysUntilDeauth: number) {
  const Provider = titleCaseProvider(provider);
  if (lang === "zh") {
    return {
      title: `${Provider} 連線即將解除`,
      message: `你已 ${daysInactive} 天未登入。再過 ${daysUntilDeauth} 天，你的 ${Provider} 連線將自動解除。立即登入以保留連線，或升級 Premium 永久保留！`,
    };
  }
  return {
    title: `${Provider} connection expiring`,
    message: `You haven't signed in for ${daysInactive} days. Your ${Provider} connection will auto-disconnect in ${daysUntilDeauth} day(s). Sign in to keep it — or upgrade to Premium to keep it forever!`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: { dryRun?: boolean; forceMode?: "warn" | "deauth"; forceHktDate?: string; source?: string; minDaysOverride?: number; daysUntilDeauthOverride?: number } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const dryRun = !!body.dryRun;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Decide mode by HKT calendar date
  const now = new Date();
  const hkt = body.forceHktDate
    ? (() => { const [y,m,d] = body.forceHktDate!.split("-").map(Number); return { year: y, month: m, day: d, iso: body.forceHktDate! }; })()
    : hktDateParts(now);
  const lastDay = lastDayOfMonth(hkt.year, hkt.month);

  let mode: "deauth" | "warn" | "noop";
  if (body.forceMode) {
    mode = body.forceMode;
  } else if (hkt.day === 1) {
    mode = "deauth";
  } else if ((hkt.day === lastDay || hkt.day === lastDay - 1) && hkt.iso >= WARN_START_HKT) {
    mode = "warn";
  } else {
    mode = "noop";
  }

  if (mode === "noop") {
    return json({ ok: true, mode, hkt: hkt.iso, message: "no action today" });
  }

  // Days until next deauth (always = days remaining until next month's 1st in HKT)
  const daysUntilDeauth = body.daysUntilDeauthOverride ?? (mode === "warn" ? (lastDay - hkt.day + 1) : 0);
  const warnMinDays = body.minDaysOverride ?? WARN_MIN_DAYS;

  // Load all active terra connections + their profiles
  const { data: conns, error: connErr } = await admin
    .from("terra_connections")
    .select("id, user_id, terra_user_id, provider, active")
    .eq("active", true);
  if (connErr) return json({ error: connErr.message }, 500);
  if (!conns || conns.length === 0) {
    return json({ ok: true, mode, hkt: hkt.iso, connections: 0 });
  }

  const userIds = Array.from(new Set(conns.map((c) => c.user_id)));
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("user_id, is_premium, last_login, lang")
    .in("user_id", userIds);
  if (profErr) return json({ error: profErr.message }, 500);
  const profByUser = new Map<string, any>();
  for (const p of profiles ?? []) profByUser.set(p.user_id, p);

  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();

  const planned: any[] = [];
  for (const conn of conns) {
    const prof = profByUser.get(conn.user_id);
    if (!prof) continue;
    if (prof.is_premium) continue; // premium exempt always
    if (!prof.last_login) continue;
    const days = Math.floor((nowMs - new Date(prof.last_login).getTime()) / dayMs);

    if (mode === "deauth" && days >= DEAUTH_THRESHOLD) {
      planned.push({ conn, profile: prof, days });
    } else if (mode === "warn" && days >= warnMinDays) {
      planned.push({ conn, profile: prof, days });
    }
  }

  const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
  const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";

  const results: any[] = [];

  if (mode === "deauth") {
    if (dryRun) {
      return json({
        ok: true, mode, hkt: hkt.iso, dryRun: true,
        candidates: planned.map((p) => ({ user_id: p.conn.user_id, provider: p.conn.provider, days: p.days })),
      });
    }
    for (const item of planned) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/terra-admin-deauth`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-secret": serviceKey,
            "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          },
          body: JSON.stringify({ connection_id: item.conn.id }),
        });
        const out = await res.json().catch(() => null);
        results.push({ user_id: item.conn.user_id, provider: item.conn.provider, days: item.days, ok: res.ok, out });
      } catch (e) {
        results.push({ user_id: item.conn.user_id, provider: item.conn.provider, ok: false, error: String(e) });
      }
    }
    return json({ ok: true, mode, hkt: hkt.iso, processed: results.length, results });
  }

  // mode === "warn"
  if (!onesignalAppId || !onesignalApiKey) {
    return json({ ok: false, mode, hkt: hkt.iso, error: "OneSignal not configured" }, 500);
  }
  if (dryRun) {
    return json({
      ok: true, mode, hkt: hkt.iso, dryRun: true,
      candidates: planned.map((p) => ({ user_id: p.conn.user_id, provider: p.conn.provider, days: p.days, daysUntilDeauth })),
    });
  }
  for (const item of planned) {
    const provider = String(item.conn.provider ?? "");
    // Dedup per (user, provider, day)
    const { data: already } = await admin
      .from("terra_inactivity_notifications")
      .select("id")
      .eq("user_id", item.conn.user_id)
      .eq("provider", provider)
      .eq("sent_on", hkt.iso)
      .maybeSingle();
    if (already) {
      results.push({ user_id: item.conn.user_id, provider, days: item.days, skipped: "already_sent_today" });
      continue;
    }
    const lang: "zh" | "en" = String(item.profile.lang ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
    const { title, message } = buildMsg(lang, item.days, provider, daysUntilDeauth);

    try {
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Basic ${onesignalApiKey}` },
        body: JSON.stringify({
          app_id: onesignalAppId,
          include_external_user_ids: [item.conn.user_id],
          headings: { en: title },
          contents: { en: message },
        }),
      });
      const out = await res.json().catch(() => null);
      if (res.ok) {
        await admin.from("terra_inactivity_notifications").insert({
          user_id: item.conn.user_id,
          provider,
          sent_on: hkt.iso,
          days_inactive: item.days,
        });
      }
      results.push({ user_id: item.conn.user_id, provider, days: item.days, ok: res.ok, out });
    } catch (e) {
      results.push({ user_id: item.conn.user_id, provider, ok: false, error: String(e) });
    }
  }

  return json({ ok: true, mode, hkt: hkt.iso, daysUntilDeauth, processed: results.length, results });
});
