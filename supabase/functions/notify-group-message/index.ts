// Push a new group chat message to group members who kept notifications on.
// Called by the DB trigger tg_notify_group_message with header x-webhook-key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const clip = (text: string, max = 120) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.headers.get("x-webhook-key") !== Deno.env.get("WEBHOOK_AUTH_KEY")) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const messageId = String(body?.message_id ?? "");
    if (!messageId) return json({ error: "Invalid payload" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: message } = await supabase
      .from("group_messages")
      .select("id, group_id, user_id, body, deleted_at")
      .eq("id", messageId)
      .maybeSingle();
    if (!message || message.deleted_at) return json({ skipped: "message_not_found" });

    const [{ data: group }, { data: sender }] = await Promise.all([
      supabase.from("leaderboard_groups").select("name, emoji").eq("id", message.group_id).maybeSingle(),
      supabase.from("profiles").select("display_name").eq("user_id", message.user_id).maybeSingle(),
    ]);

    const groupName = group?.name?.trim() || "Group";
    const senderName = sender?.display_name?.trim() || "A runner";

    const { data: recipients } = await supabase.rpc("get_group_chat_push_recipients", {
      p_group_id: message.group_id,
      p_exclude_user: message.user_id,
    });
    const list = (recipients || []) as Array<{ user_id: string; lang: string | null }>;
    if (list.length === 0) return json({ sent: 0 });

    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!onesignalAppId || !onesignalApiKey) return json({ error: "OneSignal not configured" }, 500);

    const preview = clip(String(message.body ?? "").replace(/\s+/g, " ").trim());
    const zhIds = list.filter((r) => String(r.lang || "").toLowerCase().startsWith("zh")).map((r) => r.user_id);
    const enIds = list.filter((r) => !String(r.lang || "").toLowerCase().startsWith("zh")).map((r) => r.user_id);

    const send = async (ids: string[], title: string, text: string) => {
      if (ids.length === 0) return 0;
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${onesignalApiKey}` },
        body: JSON.stringify({
          app_id: onesignalAppId,
          include_external_user_ids: ids,
          headings: { en: title },
          contents: { en: text },
        }),
      });
      console.log(`[notify-group-message] OneSignal ${res.status}: ${await res.text()}`);
      return res.ok ? ids.length : 0;
    };

    const sent =
      (await send(zhIds, `${group?.emoji || "💬"} ${groupName}`, `${senderName}：${preview}`)) +
      (await send(enIds, `${group?.emoji || "💬"} ${groupName}`, `${senderName}: ${preview}`));

    return json({ sent, recipients: list.length });
  } catch (err) {
    console.error("[notify-group-message] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
