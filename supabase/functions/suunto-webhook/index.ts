import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUUNTO_API_BASE, refreshSuuntoToken, workoutRow, SuuntoWorkout } from "../_shared/suunto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Suunto pings the workout-notification URL on completion with JSON
  // { username: "...", workoutid: "..." }. Respond 200 quickly.
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  let event: any = null;
  try { event = await req.json(); }
  catch (_) {
    try { event = JSON.parse(await req.text()); } catch (_) { /* ignore */ }
  }
  console.log('[suunto-webhook] event:', JSON.stringify(event));

  if (!event?.username || !event?.workoutid) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('SUUNTO_CLIENT_ID')!;
    const clientSecret = Deno.env.get('SUUNTO_CLIENT_SECRET')!;
    const subKey = Deno.env.get('SUUNTO_SUBSCRIPTION_KEY') || clientId;
    const supabase = createClient(SUPABASE_URL, SERVICE);

    const { data: conn } = await supabase
      .from('suunto_connections')
      .select('*')
      .eq('suunto_username', event.username)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conn) {
      console.log('[suunto-webhook] no connection for', event.username);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await refreshSuuntoToken(conn, supabase, clientId, clientSecret);

    const res = await fetch(`${SUUNTO_API_BASE}/workout/${event.workoutid}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Ocp-Apim-Subscription-Key': subKey,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[suunto-webhook] fetch workout failed', res.status, text);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const payload = JSON.parse(text);
    const w: SuuntoWorkout = payload?.payload ?? payload;

    if (w?.workoutKey) {
      await supabase
        .from('suunto_activities')
        .upsert(workoutRow(conn.user_id, w), { onConflict: 'suunto_workout_key' });
      console.log('[suunto-webhook] saved workout', w.workoutKey, 'for', conn.user_id);
    }
  } catch (err) {
    console.error('[suunto-webhook] error:', err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
