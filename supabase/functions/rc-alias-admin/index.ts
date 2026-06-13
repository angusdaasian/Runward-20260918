// One-off admin tool: alias an existing RC app_user_id to a Supabase user_id.
// Usage: POST { existing_app_user_id, new_app_user_id }
// Auth: WEBHOOK_AUTH_KEY in Authorization header.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (auth !== Deno.env.get("WEBHOOK_AUTH_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { existing_app_user_id, new_app_user_id } = await req.json();
  if (!existing_app_user_id || !new_app_user_id) {
    return new Response(JSON.stringify({ error: "missing ids" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rcKey = Deno.env.get("REVENUECAT_SECRET_KEY");
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(existing_app_user_id)}/alias`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rcKey}`,
      },
      body: JSON.stringify({ new_app_user_id }),
    },
  );
  const text = await res.text();
  return new Response(JSON.stringify({ status: res.status, body: text }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
