import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { redirect_uri, environment } = await req.json();
    if (!redirect_uri) {
      return new Response(JSON.stringify({ error: 'redirect_uri is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use client-sent environment (from getAppEnvironment()) to pick credentials
    const env = environment || Deno.env.get('APP_ENVIRONMENT') || 'dev';
    const STRAVA_CLIENT_ID = env === 'prod'
      ? Deno.env.get('STRAVA_CLIENT_ID_PROD')
      : Deno.env.get('STRAVA_CLIENT_ID');
    if (!STRAVA_CLIENT_ID) {
      throw new Error(`STRAVA_CLIENT_ID not configured for env: ${env}`);
    }

    console.log(`strava-auth: env=${env}, client_id=${STRAVA_CLIENT_ID}`);

    // Pass environment through state parameter so callback knows which env
    const state = JSON.stringify({ environment: env });

    const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=read,activity:read_all&approval_prompt=auto&state=${encodeURIComponent(state)}`;

    return new Response(JSON.stringify({ url: stravaAuthUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('strava-auth error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
