import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pickAvailableApp, StravaAppsError } from "../_shared/strava-apps.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { redirect_uri } = await req.json();
    if (!redirect_uri) {
      return new Response(JSON.stringify({ error: 'redirect_uri is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const app = await pickAvailableApp(supabase);
    console.log(`strava-auth: routing to app client_id=${app.client_id} (id=${app.id})`);

    const state = JSON.stringify({ app_id: app.id });
    const stravaAuthUrl =
      `https://www.strava.com/oauth/authorize?client_id=${app.client_id}` +
      `&response_type=code&redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&scope=read,activity:read_all&approval_prompt=auto` +
      `&state=${encodeURIComponent(state)}`;

    return new Response(JSON.stringify({ url: stravaAuthUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('strava-auth error:', error);
    if (error instanceof StravaAppsError) {
      return new Response(JSON.stringify({ error: error.message, code: error.code }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
