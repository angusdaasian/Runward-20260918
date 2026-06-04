import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) return {};
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  try {
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const clientId = Deno.env.get('SUUNTO_CLIENT_ID');
    const clientSecret = Deno.env.get('SUUNTO_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Suunto not configured', code: 'NOT_CONFIGURED' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    const { code, redirect_uri } = await req.json();
    if (!code || !redirect_uri) {
      return new Response(JSON.stringify({ error: 'code and redirect_uri required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const basic = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch('https://cloudapi-oauth.suunto.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('suunto token exchange failed', tokenData);
      throw new Error(`Suunto token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    const claims = decodeJwtPayload(String(tokenData.access_token ?? ''));
    // Suunto returns the username in the JWT custom claim named "user".
    const username = tokenData.user || tokenData.username || claims.user;
    if (!username) throw new Error('No username in Suunto token response');

    const expiresAt = Math.floor(Date.now() / 1000) + Number(tokenData.expires_in || 3600);

    // Drop stale rows pointing to the same Suunto user under a different account
    const supabase = createClient(SUPABASE_URL, SERVICE);
    await supabase
      .from('suunto_connections')
      .delete()
      .eq('suunto_username', username)
      .neq('user_id', user.id);

    const { error: dbError } = await supabase
      .from('suunto_connections')
      .upsert({
        user_id: user.id,
        suunto_username: String(username),
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    return new Response(JSON.stringify({ success: true, username }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('suunto-callback error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
