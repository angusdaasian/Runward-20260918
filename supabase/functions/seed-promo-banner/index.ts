// One-shot seeding function for the initial promo banner.
// Anyone can call it, but it only inserts when the bucket has zero TCS banners.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const imageUrl: string = body.image_url;
    const endsAt: string = body.ends_at;
    const caption: string = body.caption ?? "";
    const captionZh: string = body.caption_zh ?? "";
    const createdBy: string = body.created_by;

    if (!imageUrl || !endsAt || !createdBy) {
      return new Response(JSON.stringify({ error: "image_url, ends_at, created_by required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the source image
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) {
      return new Response(JSON.stringify({ error: `failed fetching image: ${imgResp.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bytes = new Uint8Array(await imgResp.arrayBuffer());
    const filename = `tcs-london-marathon-2027-${Date.now()}.png`;

    const { error: upErr } = await supabase.storage
      .from("promo-banners")
      .upload(filename, bytes, { contentType: "image/png", upsert: false });

    if (upErr) {
      return new Response(JSON.stringify({ error: `upload: ${upErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pub } = supabase.storage.from("promo-banners").getPublicUrl(filename);

    const { data: row, error: insErr } = await supabase
      .from("promo_banners")
      .insert({
        image_url: pub.publicUrl,
        caption,
        caption_zh: captionZh,
        display_order: 0,
        ends_at: endsAt,
        is_active: true,
        created_by: createdBy,
      })
      .select()
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ error: `insert: ${insErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: row.id, image_url: pub.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
