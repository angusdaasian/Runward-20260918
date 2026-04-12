import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight remote logger — writes debug entries to the `debug_logs` table.
 * Fire-and-forget: errors are silently swallowed so logging never breaks the app.
 */
export async function remoteLog(tag: string, message: string, payload?: unknown) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;

    // Truncate payload to ~50KB to avoid row-size limits
    let safePayload: unknown = null;
    if (payload !== undefined) {
      const json = JSON.stringify(payload);
      safePayload = json.length > 50_000 ? JSON.parse(json.substring(0, 50_000) + '..."') : payload;
    }

    await (supabase as any).from("debug_logs").insert({
      user_id: session.user.id,
      tag,
      message,
      payload: safePayload,
    });
  } catch {
    // never throw — logging is best-effort
  }
}
