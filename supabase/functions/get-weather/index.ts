// Public edge function that proxies WeatherAPI.com calls so the API key stays secret.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const city = (url.searchParams.get('city') || '').trim();
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
    const res = await fetch(apiUrl);
    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || 'Weather lookup failed' }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const current = data.current;
    const today = data.forecast?.forecastday?.[0]?.day;
    const location = data.location;

    return new Response(
      JSON.stringify({
        city: location?.name ?? city,
        region: location?.region ?? '',
        country: location?.country ?? '',
        temperature: Math.round(current?.temp_c ?? 0),
        conditionText: current?.condition?.text ?? '',
        conditionCode: current?.condition?.code ?? 0,
        isDay: current?.is_day === 1,
        high: Math.round(today?.maxtemp_c ?? current?.temp_c ?? 0),
        low: Math.round(today?.mintemp_c ?? current?.temp_c ?? 0),
        humidity: current?.humidity ?? null,
        wind_kph: current?.wind_kph ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
