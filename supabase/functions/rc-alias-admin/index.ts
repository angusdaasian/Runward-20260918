// One-off admin tool: alias the RC anonymous customer bb9d6ce3-… to
// martin1993's Supabase UID. Hardcoded; safe because both IDs are fixed
// and the function will be deleted after use.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const EXISTING = "bb9d6ce3-989e-46a6-b6c1-1fea08c1b87f";
const NEW_ID = "45e41f43-8d04-410a-99bb-d76b76dad63c";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rcKey = Deno.env.get("REVENUECAT_SECRET_KEY");
  if (!rcKey) {
    return new Response(JSON.stringify({ error: "REVENUECAT_SECRET_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${EXISTING}/alias`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rcKey}`,
      },
      body: JSON.stringify({ new_app_user_id: NEW_ID }),
    },
  );
  const text = await res.text();
  return new Response(JSON.stringify({ status: res.status, body: text }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
