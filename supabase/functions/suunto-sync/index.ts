import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUUNTO_API_BASE, refreshSuuntoToken, workoutRow, SuuntoWorkout } from "../_shared/suunto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const clientId = Deno.env.get('SUUNTO_CLIENT_ID')!;
    const clientSecret = Deno.env.get('SUUNTO_CLIENT_SECRET')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const anonClient = createClient(SUPABASE_URL, ANON);
    const { data: { user }, error: userError } =
      await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE);
    const { data: conn, error: connErr } = await supabase
      .from('suunto_connections')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: 'No Suunto connection' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional time window: { sinceDays?: number, since?: number(ms), until?: number(ms) }
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* ok */ }
    const sinceDays = Number(body?.sinceDays ?? 30);
    const since = Number(body?.since ?? Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const until = Number(body?.until ?? Date.now());

    const accessToken = await refreshSuuntoToken(conn, supabase, clientId, clientSecret);

    const url = new URL(`${SUUNTO_API_BASE}/workouts`);
    url.searchParams.set('since', String(since));
    url.searchParams.set('until', String(until));

    console.log(`[suunto-sync] fetching ${url.toString()} user=${user.id}`);
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Ocp-Apim-Subscription-Key': clientId,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[suunto-sync] api error', res.status, text);
      throw new Error(`Suunto API ${res.status}: ${text}`);
    }
    const payload = JSON.parse(text);
    const workouts: SuuntoWorkout[] = payload?.payload ?? payload?.workouts ?? [];

    let count = 0;
    for (const w of workouts) {
      if (!w?.workoutKey) continue;
      const { error: upErr } = await supabase
        .from('suunto_activities')
        .upsert(workoutRow(user.id, w), { onConflict: 'suunto_workout_key' });
      if (upErr) {
        console.error('[suunto-sync] upsert err', upErr);
        continue;
      }
      count++;
    }

    return new Response(JSON.stringify({ success: true, count, total: workouts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('suunto-sync error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
