import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { redirect_uri } = await req.json();
    if (!redirect_uri) {
      return new Response(JSON.stringify({ error: 'redirect_uri is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = Deno.env.get('SUUNTO_CLIENT_ID');
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'SUUNTO_CLIENT_ID not configured', code: 'NOT_CONFIGURED' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url =
      `https://cloudapi-oauth.suunto.com/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirect_uri)}`;

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('suunto-auth error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
