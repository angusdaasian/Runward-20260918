import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAppForConnection } from "../_shared/strava-apps.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function refreshTokenIfNeeded(
  connection: any,
  supabase: any,
  clientId: string,
  clientSecret: string
) {
  const now = Math.floor(Date.now() / 1000);
  if (connection.expires_at > now + 60) {
    return connection.access_token;
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  await supabase
    .from('strava_connections')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', connection.user_id);

  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { strava_id } = await req.json();
    if (!strava_id) {
      return new Response(JSON.stringify({ error: 'strava_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: connection } = await supabase
      .from('strava_connections')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!connection) {
      return new Response(JSON.stringify({ error: 'No Strava connection found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const app = await getAppForConnection(supabase, connection);
    if (!app.client_secret) throw new Error(`Strava app ${app.client_id} missing client_secret`);

    const accessToken = await refreshTokenIfNeeded(
      connection, supabase, app.client_id, app.client_secret
    );

    const streamsUrl = `https://www.strava.com/api/v3/activities/${strava_id}/streams?keys=time,distance,heartrate,altitude,velocity_smooth,cadence,latlng&key_type=time`;
    const streamsRes = await fetch(streamsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!streamsRes.ok) {
      const errText = await streamsRes.text();
      console.error(`Strava streams API error: ${streamsRes.status} ${errText}`);
      return new Response(JSON.stringify({ error: 'Failed to fetch activity streams', streams: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const streamsData = await streamsRes.json();

    const activityRes = await fetch(
      `https://www.strava.com/api/v3/activities/${strava_id}?include_all_efforts=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let splits = null;
    let laps = null;
    if (activityRes.ok) {
      const activityData = await activityRes.json();
      splits = activityData.splits_metric || null;
      laps = activityData.laps || null;
    }

    return new Response(JSON.stringify({ streams: streamsData, splits, laps }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching streams:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
