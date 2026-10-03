// Admin-only OneSignal cleanup: removes OneSignal users that are not linked
// to a current RunWard account (anonymous installs or deleted accounts).
// Modes:
//   export -> request a CSV export, returns csv_url (ready after ~1-5 min)
//   scan   -> download csv_url, return counts (dry run, deletes nothing)
//   delete -> start a cleanup run that self-chains in the background
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const APP_ID = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";
const osAuth = () => (API_KEY.startsWith("os_v2_") ? `Key ${API_KEY}` : `Basic ${API_KEY}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUDGET_MS = 40_000;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = ""; if (row.some((x) => x !== "")) rows.push(row); row = [];
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function loadCsv(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { notReady: true as const, status: res.status };
  const buf = new Uint8Array(await res.arrayBuffer());
  let text: string;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(buf);
  const rows = parseCsv(text);
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const idIdx = header.indexOf("id");
  const extIdx = header.indexOf("external_user_id");
  return {
    notReady: false as const,
    subs: rows.map((r) => ({ id: r[idIdx]?.trim() ?? "", ext: extIdx >= 0 ? (r[extIdx]?.trim() ?? "") : "" }))
      .filter((s) => s.id),
  };
}

async function loadUserIds(admin: ReturnType<typeof createClient>) {
  const ids = new Set<string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach((u) => ids.add(u.id));
    if (data.users.length < 1000) break;
  }
  return ids;
}

function classify(subs: { id: string; ext: string }[], users: Set<string>) {
  const linked = subs.filter((s) => s.ext && users.has(s.ext));
  const deletedAccount = subs.filter((s) => s.ext && !users.has(s.ext));
  const anonymous = subs.filter((s) => !s.ext);
  const candidates = [...anonymous, ...deletedAccount].map((s) => s.id).sort();
  return { linked, deletedAccount, anonymous, candidates };
}

async function processChunk(runId: string) {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: run } = await admin.from("onesignal_cleanup_runs").select("*").eq("id", runId).maybeSingle();
  if (!run || run.status !== "running") return;
  const started = Date.now();
  const csv = await loadCsv(run.csv_url);
  if (csv.notReady) {
    await admin.from("onesignal_cleanup_runs").update({ status: "error", last_error: "CSV export expired" }).eq("id", runId);
    return;
  }
  const users = await loadUserIds(admin);
  const { candidates } = classify(csv.subs, users);
  let { processed, deleted, skipped_linked, failed } = run;
  let lastError: string | null = run.last_error;

  while (processed < candidates.length && Date.now() - started < BUDGET_MS) {
    const sid = candidates[processed];
    try {
      const idRes = await fetch(`https://api.onesignal.com/apps/${APP_ID}/subscriptions/${sid}/user/identity`, {
        headers: { Authorization: osAuth() },
      });
      if (idRes.status === 404) { deleted++; }
      else if (idRes.status === 429) { await sleep(3000); continue; }
      else if (!idRes.ok) { failed++; lastError = `identity ${idRes.status}: ${(await idRes.text()).slice(0, 200)}`; }
      else {
        const identity = (await idRes.json())?.identity ?? {};
        const ext = identity.external_id as string | undefined;
        if (ext && users.has(ext)) skipped_linked++;
        else if (!identity.onesignal_id) failed++;
        else {
          const del = await fetch(`https://api.onesignal.com/apps/${APP_ID}/users/by/onesignal_id/${identity.onesignal_id}`, {
            method: "DELETE", headers: { Authorization: osAuth() },
          });
          if (del.status === 429) { await sleep(3000); continue; }
          if (del.ok || del.status === 404) deleted++;
          else { failed++; lastError = `delete ${del.status}: ${(await del.text()).slice(0, 200)}`; }
        }
      }
    } catch (e) { failed++; lastError = String(e); }
    processed++;
    await sleep(120);
  }

  const done = processed >= candidates.length;
  await admin.from("onesignal_cleanup_runs").update({
    processed, deleted, skipped_linked, failed, last_error: lastError,
    total_candidates: candidates.length, status: done ? "done" : "running", updated_at: new Date().toISOString(),
  }).eq("id", runId);

  if (!done) {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/onesignal-cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-key": Deno.env.get("WEBHOOK_AUTH_KEY") ?? "" },
      body: JSON.stringify({ mode: "continue", run_id: runId }),
    }).catch(() => {});
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!APP_ID || !API_KEY) return json({ error: "OneSignal not configured" }, 500);
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? "");

    // Internal self-chain
    if (mode === "continue") {
      if (req.headers.get("x-webhook-key") !== Deno.env.get("WEBHOOK_AUTH_KEY")) return json({ error: "Unauthorized" }, 401);
      const runId = String(body?.run_id ?? "");
      if (!runId) return json({ error: "run_id required" }, 400);
      EdgeRuntime.waitUntil(processChunk(runId));
      return json({ ok: true });
    }

    // Hourly cron: start deleting from the export requested last hour, then
    // request a fresh export for the next run. No-op while a run is active.
    if (mode === "auto") {
      if (req.headers.get("x-webhook-key") !== Deno.env.get("WEBHOOK_AUTH_KEY")) return json({ error: "Unauthorized" }, 401);
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: active } = await admin.from("onesignal_cleanup_runs").select("id")
        .eq("status", "running").gt("updated_at", new Date(Date.now() - 30 * 60e3).toISOString()).limit(1);
      if (active?.length) return json({ skipped: "run in progress" });
      const { data: pend } = await admin.from("onesignal_cleanup_runs").select("id, csv_url")
        .eq("status", "exporting").order("created_at", { ascending: false }).limit(1);
      let started: string | null = null;
      if (pend?.[0]) {
        const csv = await loadCsv(pend[0].csv_url);
        if (!csv.notReady) {
          await admin.from("onesignal_cleanup_runs").update({ status: "running" }).eq("id", pend[0].id);
          EdgeRuntime.waitUntil(processChunk(pend[0].id));
          started = pend[0].id;
        } else if (!started) {
          await admin.from("onesignal_cleanup_runs").update({ status: "error", last_error: "export not ready" }).eq("id", pend[0].id);
        }
      }
      const res = await fetch(`https://api.onesignal.com/players/csv_export?app_id=${APP_ID}`, {
        method: "POST",
        headers: { Authorization: osAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ extra_fields: ["external_user_id"] }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out?.csv_file_url) {
        await admin.from("onesignal_cleanup_runs").insert({ csv_url: out.csv_file_url, status: "exporting" });
      } else console.error("[onesignal-cleanup] auto export", res.status, out);
      return json({ started, exported: !!out?.csv_file_url });
    }


    // Admin check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (mode === "export") {
      const res = await fetch(`https://api.onesignal.com/players/csv_export?app_id=${APP_ID}`, {
        method: "POST",
        headers: { Authorization: osAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ extra_fields: ["external_user_id"] }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.csv_file_url) return json({ error: "Export failed", status: res.status, details: out }, 502);
      return json({ csv_url: out.csv_file_url });
    }

    const csvUrl = String(body?.csv_url ?? "");
    if (!/^https:\/\//.test(csvUrl)) return json({ error: "csv_url required" }, 400);

    if (mode === "scan") {
      const csv = await loadCsv(csvUrl);
      if (csv.notReady) return json({ ready: false });
      const users = await loadUserIds(admin);
      const c = classify(csv.subs, users);
      return json({
        ready: true,
        total: csv.subs.length,
        linked: c.linked.length,
        anonymous: c.anonymous.length,
        deleted_account: c.deletedAccount.length,
        candidates: c.candidates.length,
        registered_users: users.size,
        linked_accounts: new Set(c.linked.map((s) => s.ext)).size,
      });
    }

    if (mode === "delete") {
      const { data: run, error } = await admin.from("onesignal_cleanup_runs")
        .insert({ csv_url: csvUrl }).select("id").single();
      if (error) throw error;
      EdgeRuntime.waitUntil(processChunk(run.id));
      return json({ run_id: run.id });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (e) {
    console.error("[onesignal-cleanup]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
