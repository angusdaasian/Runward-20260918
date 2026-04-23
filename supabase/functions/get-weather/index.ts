// Authenticated edge function that proxies WeatherAPI.com calls so the API key stays secret.
// Requires a valid Supabase JWT and applies a per-user in-memory rate limit (30 req / 5 min).
// Accepts both POST (JSON body { city }) and GET (?city=) for backwards compatibility.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Per-user rate limit (in-memory; resets on cold start, fine for abuse throttling)
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRate(userId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- AUTH ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    // --- RATE LIMIT ---
    if (!checkRate(userId)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- INPUT (POST body or GET query) ---
    let city = '';
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        city = (body?.city || '').toString().trim();
      } catch {
        // fall through to validation error below
      }
    } else {
      const url = new URL(req.url);
      city = (url.searchParams.get('city') || '').trim();
    }

    if (!city || city.length > 100) {
      return new Response(JSON.stringify({ error: 'Invalid city' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('WEATHERAPI_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiUrl = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(city)}&days=1&aqi=no&alerts=no`;
    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
    });
    const raw = await res.text();
    let data: any = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      console.error('[get-weather] Non-JSON upstream response', { status: res.status, body: raw.slice(0, 400) });
      return new Response(JSON.stringify({ error: 'Weather provider error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!res.ok) {
      console.error('[get-weather] Upstream request failed', { status: res.status, data });
      return new Response(JSON.stringify({ error: data?.error?.message || 'Weather lookup failed' }), {
        status: res.status >= 400 && res.status < 500 ? res.status : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!data?.location || !data?.current) {
      console.error('[get-weather] Upstream payload missing required fields', data);
      return new Response(JSON.stringify({ error: 'Weather provider error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const current = data.current;
    const todayDay = data.forecast?.forecastday?.[0]?.day;
    const todayAstro = data.forecast?.forecastday?.[0]?.astro;
    const hourArr: any[] = data.forecast?.forecastday?.[0]?.hour || [];
    const location = data.location;

    const hourly = hourArr.map((h: any) => ({
      time: h.time,
      temp_c: Math.round(h.temp_c ?? 0),
      feelslike_c: Math.round(h.feelslike_c ?? h.temp_c ?? 0),
      condition: h.condition?.text ?? '',
      code: h.condition?.code ?? 0,
      is_day: h.is_day === 1,
      chance_of_rain: h.chance_of_rain ?? 0,
      chance_of_snow: h.chance_of_snow ?? 0,
      humidity: h.humidity ?? null,
      wind_kph: h.wind_kph ?? null,
      uv: h.uv ?? null,
    }));

    return new Response(
      JSON.stringify({
        city: location?.name ?? city,
        region: location?.region ?? '',
        country: location?.country ?? '',
        localtime: location?.localtime ?? null,
        tz_id: location?.tz_id ?? null,
        temperature: Math.round(current?.temp_c ?? 0),
        feelslike: Math.round(current?.feelslike_c ?? current?.temp_c ?? 0),
        conditionText: current?.condition?.text ?? '',
        conditionCode: current?.condition?.code ?? 0,
        isDay: current?.is_day === 1,
        high: Math.round(todayDay?.maxtemp_c ?? current?.temp_c ?? 0),
        low: Math.round(todayDay?.mintemp_c ?? current?.temp_c ?? 0),
        humidity: current?.humidity ?? null,
        wind_kph: current?.wind_kph ?? null,
        uv: current?.uv ?? null,
        sunrise: todayAstro?.sunrise ?? null,
        sunset: todayAstro?.sunset ?? null,
        chance_of_rain: todayDay?.daily_chance_of_rain ?? null,
        hourly,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (e) {
    console.error('[get-weather] Unhandled error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
