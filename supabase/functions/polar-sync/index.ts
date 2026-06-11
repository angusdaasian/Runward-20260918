import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { POLAR_API_BASE, exerciseRow, PolarExercise } from "../_shared/polar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(SUPABASE_URL, ANON);
    const { data: { user }, error: userError } =
      await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE);
    const { data: conn, error: connErr } = await supabase
      .from("polar_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: "No Polar connection" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = conn.access_token as string;
    const polarUserId = conn.polar_user_id as number;
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
    };

    // AccessLink uses a transaction-based pull model:
    // 1) Create an exercise transaction → returns transaction-id + list of exercise URLs.
    // 2) GET each exercise URL for details.
    // 3) PUT the transaction to commit (Polar then marks data as fetched).
    const txRes = await fetch(
      `${POLAR_API_BASE}/users/${polarUserId}/exercise-transactions`,
      { method: "POST", headers },
    );

    // 204 = no new exercises pending
    if (txRes.status === 204) {
      return new Response(JSON.stringify({ success: true, count: 0, total: 0, note: "No new exercises" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!txRes.ok) {
      const txt = await txRes.text();
      console.error("[polar-sync] tx create failed", txRes.status, txt);
      throw new Error(`Polar transaction create failed (${txRes.status}): ${txt}`);
    }

    const txData = await txRes.json();
    const txId = txData["transaction-id"] ?? txData.transactionId;
    const exerciseUrls: string[] = txData["resource-uri"] ? [txData["resource-uri"]] :
      (txData.exercises ?? []);

    // Some responses put URLs under .exercises directly; in newer Polar API, list endpoint:
    // GET /v3/users/{user}/exercise-transactions/{tx} returns { exercises: [url, ...] }
    let urls: string[] = exerciseUrls;
    if (!urls.length && txId) {
      const listRes = await fetch(
        `${POLAR_API_BASE}/users/${polarUserId}/exercise-transactions/${txId}`,
        { headers },
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        urls = listData.exercises ?? [];
      }
    }

    let count = 0;
    const errors: string[] = [];
    for (const url of urls) {
      try {
        const exRes = await fetch(url, { headers });
        if (!exRes.ok) {
          errors.push(`${url}: ${exRes.status}`);
          continue;
        }
        const ex = await exRes.json() as PolarExercise;
        const { error: upErr } = await supabase
          .from("polar_activities")
          .upsert(exerciseRow(user.id, ex), { onConflict: "polar_exercise_id" });
        if (upErr) {
          errors.push(`${url}: db ${upErr.message}`);
          continue;
        }
        count++;
      } catch (e) {
        errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Commit the transaction (only after we've safely stored data)
    if (txId) {
      await fetch(
        `${POLAR_API_BASE}/users/${polarUserId}/exercise-transactions/${txId}`,
        { method: "PUT", headers },
      ).catch((e) => console.warn("[polar-sync] commit failed", e));
    }

    return new Response(JSON.stringify({
      success: true,
      count,
      total: urls.length,
      transaction_id: txId ?? null,
      errors: errors.length ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("polar-sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
