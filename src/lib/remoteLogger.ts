import { supabase } from "@/integrations/supabase/client";

interface LogResult {
  ok: boolean;
  error?: string;
}

/**
 * Remote logger — writes debug entries to the `debug_logs` table.
 * Returns success/failure so callers can detect issues.
 */
export async function remoteLog(tag: string, message: string, payload?: unknown): Promise<LogResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      console.warn("[remoteLog] No session — skipping log:", tag, message);
      return { ok: false, error: "no_session" };
    }

    // Safely serialize payload, truncate to ~50KB
    let safePayload: unknown = null;
    if (payload !== undefined) {
      try {
        const json = JSON.stringify(payload);
        if (json.length > 50_000) {
          safePayload = { _truncated: true, _length: json.length, _preview: json.substring(0, 49_000) };
        } else {
          safePayload = payload;
        }
      } catch (serErr) {
        safePayload = { _serializationError: String(serErr) };
      }
    }

    const { error } = await (supabase as any).from("debug_logs").insert({
      user_id: session.user.id,
      tag,
      message,
      payload: safePayload,
    });

    if (error) {
      console.error("[remoteLog] Insert failed:", error.message, { tag, message });
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err: any) {
    console.error("[remoteLog] Unexpected error:", err?.message || err);
    return { ok: false, error: String(err) };
  }
}
