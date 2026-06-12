import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAppForConnection } from "../_shared/strava-apps.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Load the connection so we can revoke Strava access before local cleanup.
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
        // Do not refresh first: refreshing can rotate tokens, then revoking the
        // old stored refresh token can fail before the new pair is revoked.
        // Per Strava's 2026 spec, POST /oauth/revoke uses Basic Auth and only a
        // token form field. Revoking either token revokes the associated pair.
        const basicAuth = btoa(`${app.client_id}:${app.client_secret}`);
        const tokensToRevoke = [connection.refresh_token, connection.access_token]
          .filter((token, index, arr) => Boolean(token) && arr.indexOf(token) === index);

        const revokeResults = [];
        for (const token of tokensToRevoke) {
          const res = await fetch('https://www.strava.com/oauth/revoke', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${basicAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ token }),
          });
          const text = await res.text();
          revokeResults.push({ status: res.status, body: text?.slice(0, 200) });
          if (res.status === 401) {
            throw new Error(`Strava revoke unauthorized: ${text}`);
          }
          if (!res.ok && res.status !== 400 && res.status !== 503) {
            throw new Error(`Strava revoke ${res.status}: ${text}`);
          }
          if (res.ok) deauthorized = true;
          if (deauthorized) break;
        }
        console.log('strava-disconnect revoke response', revokeResults);
        if (!deauthorized && revokeResults.some((r) => r.status === 503)) {
          deauthError = 'Strava revoke temporarily unavailable; safe to retry';
          console.error('strava-disconnect revoke failed', deauthError);
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
