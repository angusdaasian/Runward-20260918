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
        const basicAuth = btoa(`${app.client_id}:${app.client_secret}`);
        const tokensToTry = [connection.refresh_token, connection.access_token]
          .filter((token, index, arr) => Boolean(token) && arr.indexOf(token) === index) as string[];

        const attempts: Array<{ endpoint: string; token: string; attempt: number; status: number; body: string }> = [];

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        // 1) Try the new /oauth/revoke endpoint with retries on 503.
        outer: for (const token of tokensToTry) {
          for (let attempt = 1; attempt <= 3; attempt++) {
            const res = await fetch('https://www.strava.com/oauth/revoke', {
              method: 'POST',
              headers: {
                Authorization: `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ token }),
            });
            const text = await res.text();
            attempts.push({ endpoint: 'revoke', token: token.slice(0, 6), attempt, status: res.status, body: text.slice(0, 120) });
            if (res.ok) { deauthorized = true; break outer; }
            if (res.status === 401) throw new Error(`Strava revoke unauthorized: ${text.slice(0, 200)}`);
            if (res.status === 400) break; // bad token — try the next one
            if (res.status !== 503) throw new Error(`Strava revoke ${res.status}: ${text.slice(0, 200)}`);
            if (attempt < 3) await sleep(500 * attempt); // backoff on 503
          }
        }

        // 2) Fallback to legacy /oauth/deauthorize?access_token=... if revoke is unavailable.
        // Still supported through June 2027 and uses the access_token as a query/body param.
        if (!deauthorized) {
          for (const token of tokensToTry) {
            for (let attempt = 1; attempt <= 2; attempt++) {
              const res = await fetch('https://www.strava.com/oauth/deauthorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ access_token: token }),
              });
              const text = await res.text();
              attempts.push({ endpoint: 'deauthorize', token: token.slice(0, 6), attempt, status: res.status, body: text.slice(0, 120) });
              if (res.ok) { deauthorized = true; break; }
              if (res.status === 401) break; // wrong/expired token — try next
              if (res.status !== 503) break;
              if (attempt < 2) await sleep(500);
            }
            if (deauthorized) break;
          }
        }

        console.log('strava-disconnect attempts', JSON.stringify(attempts));
        if (!deauthorized) {
          deauthError = attempts.some((a) => a.status === 503)
            ? 'Strava temporarily unavailable on both /oauth/revoke and /oauth/deauthorize; safe to retry'
            : `Strava deauth failed: ${JSON.stringify(attempts.slice(-2))}`;
          console.error('strava-disconnect revoke failed', deauthError);
        }
      } catch (e) {
        deauthError = e instanceof Error ? e.message : String(e);
        console.error('strava-disconnect deauthorize error', deauthError);
      }
    }

    // If Strava is still authorized (revoke failed), KEEP the local connection
    // so the user can retry. Otherwise the app would look disconnected here but
    // remain in their Strava settings forever.
    if (!deauthorized && connection) {
      return new Response(
        JSON.stringify({ success: false, deauthorized: false, deauthError, retryable: true }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
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
