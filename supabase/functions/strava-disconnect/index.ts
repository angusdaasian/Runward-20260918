import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAppForConnection } from "../_shared/strava-apps.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshIfNeeded(connection: any, supabase: any, clientId: string, clientSecret: string) {
  const now = Math.floor(Date.now() / 1000);
  if (connection.expires_at && connection.expires_at > now + 60) {
    return connection.access_token;
  }
  if (!connection.refresh_token) return connection.access_token;
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.warn("strava-disconnect refresh failed", data);
    return connection.access_token;
  }
  await supabase
    .from("strava_connections")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", connection.user_id);
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load the connection so we can call Strava's deauthorize endpoint per
    // https://developers.strava.com/docs/authentication/#deauthorization
    const { data: connection } = await supabase
      .from('strava_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    let deauthorized = false;
    let deauthError: string | null = null;

    if (connection) {
      try {
        const app = await getAppForConnection(supabase, connection);
        if (!app.client_secret) throw new Error('Missing client_secret for Strava app');
        const accessToken = await refreshIfNeeded(
          connection,
          supabase,
          app.client_id,
          app.client_secret,
        );

        // Per https://developers.strava.com/docs/authentication/#deauthorization
        // POST https://www.strava.com/oauth/deauthorize with Bearer auth.
        // Successful response returns 200 with { access_token: "..." }.
        const res = await fetch('https://www.strava.com/oauth/deauthorize', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ access_token: accessToken }),
        });
        const text = await res.text();
        console.log('strava-disconnect deauthorize response', { status: res.status, body: text?.slice(0, 200) });
        if (!res.ok) {
          // 401/410 → token already invalid / app already deauthorized on Strava's side.
          if (res.status === 401 || res.status === 410) {
            deauthorized = true;
          } else {
            deauthError = `Strava deauthorize ${res.status}: ${text}`;
            console.error('strava-disconnect deauthorize failed', deauthError);
          }
        } else {
          deauthorized = true;
        }
      } catch (e) {
        deauthError = e instanceof Error ? e.message : String(e);
        console.error('strava-disconnect deauthorize error', deauthError);
      }
    }

    // Always clear local data so the user is disconnected on our side even if
    // the Strava call failed (e.g. token already revoked, network error).
    await supabase.from('strava_activities').delete().eq('user_id', user.id);
    await supabase.from('strava_connections').delete().eq('user_id', user.id);

    return new Response(
      JSON.stringify({ success: true, deauthorized, deauthError }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('strava-disconnect error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
