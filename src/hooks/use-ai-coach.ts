import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { toast } from "sonner";

export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export type CoachPreferences = {
  preferred_units: "kilometers" | "miles";
  training_goal: string | null;
  target_race_date: string | null;
  experience_level: string | null;
  training_days: string[];
  injuries_concerns: string | null;
  training_intensity: string | null;
  thinking_level: ThinkingLevel;
};

const SESSION_KEY = "ai_coach_session_id";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

function newSessionId() {
  return crypto.randomUUID();
}

function getLang(): "en" | "zh" {
  return (localStorage.getItem("app_lang") as "en" | "zh") || "en";
}

export function useAICoach(open: boolean, onFreeLimit?: () => void) {
  const { user, session } = useAuth();
  const { isPremium } = usePremium();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [isFree, setIsFree] = useState<boolean>(!isPremium);
  const [prefs, setPrefs] = useState<CoachPreferences | null>(null);
  const [insights, setInsights] = useState<
    Array<{ insight_key: string; insight_value: string }>
  >([]);
  const [sessions, setSessions] = useState<
    Array<{ session_id: string; last_at: string; first_user_message: string; message_count: number }>
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const initRef = useRef(false);

  const callFn = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-running-coach${path}`;
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");
      const res = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(init.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: any = new Error(data?.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.code = data?.code;
        err.body = data;
        throw err;
      }
      return data;
    },
    [session?.access_token],
  );

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const storedSidRaw = localStorage.getItem(SESSION_KEY);
      const storedSid = isUuid(storedSidRaw) ? storedSidRaw : null;
      if (storedSidRaw && !storedSid) {
        localStorage.removeItem(SESSION_KEY);
      }
      // If we have a stored session id, fetch its history; otherwise fetch the
      // most recent conversation (server returns latest session when no id is given).
      const histPath = storedSid
        ? `?action=history&session_id=${storedSid}`
        : `?action=history`;

      const [prefsRes, insightsRes, histRes, usageRes, sessionsRes] = await Promise.all([
        callFn("?action=preferences", { method: "GET" }),
        callFn("?action=insights", { method: "GET" }),
        callFn(histPath, { method: "GET" }),
        callFn("?action=usage", { method: "GET" }),
        callFn("?action=sessions", { method: "GET" }),
      ]);
      setPrefs(prefsRes.preferences || null);
      setInsights(insightsRes.insights || []);
      setRemaining(usageRes.remaining ?? null);
      setDailyLimit(usageRes.limit ?? null);
      setIsFree(!!usageRes.is_free);
      setSessions(sessionsRes.sessions || []);

      const msgs = histRes.messages || [];
      // Resolve session id: stored > server-returned (from latest msg) > new
      const resolvedSid =
        storedSid ||
        (isUuid(histRes.session_id) ? histRes.session_id : null) ||
        (msgs.length && isUuid(msgs[msgs.length - 1].session_id)
          ? msgs[msgs.length - 1].session_id
          : null) ||
        newSessionId();
      localStorage.setItem(SESSION_KEY, resolvedSid);
      setSessionId(resolvedSid);

      setMessages(
        msgs.map((m: any) => ({
          id: m.id || newId(),
          role: m.role,
          content: m.content,
        })),
      );
    } catch (e) {
      console.warn("coach load failed", e);
    } finally {
      setLoadingHistory(false);
    }
  }, [user, callFn]);

  useEffect(() => {
    if (open && user && !initRef.current) {
      initRef.current = true;
      loadAll();
    }
    if (!open) initRef.current = false;
  }, [open, user, loadAll]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userMsg: CoachMessage = { id: newId(), role: "user", content: trimmed };
      const placeholder: CoachMessage = {
        id: newId(),
        role: "assistant",
        content: "",
        pending: true,
      };
      setMessages((m) => [...m, userMsg, placeholder]);
      setSending(true);
      try {
        const data = await callFn("", {
          method: "POST",
          body: JSON.stringify({
            message: trimmed,
            session_id: sessionId,
            lang: getLang(),
          }),
        });
        if (data.session_id && data.session_id !== sessionId) {
          setSessionId(data.session_id);
          localStorage.setItem(SESSION_KEY, data.session_id);
        }
        if (typeof data.remaining_messages_today === "number") {
          setRemaining(data.remaining_messages_today);
        }
        setMessages((m) =>
          m.map((x) =>
            x.id === placeholder.id
              ? { ...x, content: data.response || "", pending: false }
              : x,
          ),
        );
        // Refresh insights + sessions in background
        callFn("?action=insights", { method: "GET" })
          .then((r) => setInsights(r.insights || []))
          .catch(() => {});
        callFn("?action=sessions", { method: "GET" })
          .then((r) => setSessions(r.sessions || []))
          .catch(() => {});
      } catch (e: any) {
        setMessages((m) => m.filter((x) => x.id !== placeholder.id));
        if (e.status === 429) {
          setRemaining(0);
          toast.error(
            getLang() === "zh"
              ? "已達到今日訊息上限。將於午夜重置。"
              : "Daily message limit reached. Resets at midnight.",
          );
        } else if (e.status === 403) {
          toast.error(
            getLang() === "zh"
              ? "需要 Premium 訂閱"
              : "Premium subscription required",
          );
        } else {
          toast.error(
            getLang() === "zh"
              ? "AI 教練暫時無法使用，請再試一次"
              : "AI Coach is temporarily unavailable. Please try again.",
          );
        }
      } finally {
        setSending(false);
      }
    },
    [callFn, sending, sessionId],
  );

  const newConversation = useCallback(() => {
    const sid = newSessionId();
    localStorage.setItem(SESSION_KEY, sid);
    setSessionId(sid);
    setMessages([]);
  }, []);

  const switchSession = useCallback(
    async (sid: string) => {
      if (sid === sessionId) return;
      setLoadingHistory(true);
      localStorage.setItem(SESSION_KEY, sid);
      setSessionId(sid);
      setMessages([]);
      try {
        const histRes = await callFn(`?action=history&session_id=${sid}`, {
          method: "GET",
        });
        const msgs = histRes.messages || [];
        setMessages(
          msgs.map((m: any) => ({
            id: m.id || newId(),
            role: m.role,
            content: m.content,
          })),
        );
      } catch (e) {
        toast.error(getLang() === "zh" ? "載入失敗" : "Failed to load");
      } finally {
        setLoadingHistory(false);
      }
    },
    [callFn, sessionId],
  );

  const deleteSession = useCallback(
    async (sid: string) => {
      try {
        await callFn("?action=delete_session", {
          method: "POST",
          body: JSON.stringify({ session_id: sid }),
        });
        setSessions((prev) => prev.filter((s) => s.session_id !== sid));
        if (sid === sessionId) {
          newConversation();
        }
      } catch (e) {
        toast.error(getLang() === "zh" ? "刪除失敗" : "Failed to delete");
      }
    },
    [callFn, sessionId, newConversation],
  );

  const savePreferences = useCallback(
    async (patch: Partial<CoachPreferences>) => {
      try {
        const data = await callFn("?action=preferences", {
          method: "POST",
          body: JSON.stringify(patch),
        });
        setPrefs(data.preferences || null);
        // If thinking level changed, the remaining-message count needs to be
        // recomputed against the new daily limit (server applies ratio rule).
        if ("thinking_level" in patch) {
          callFn("?action=usage", { method: "GET" })
            .then((u) => {
              if (typeof u.remaining === "number") setRemaining(u.remaining);
            })
            .catch(() => {});
        }
        return true;
      } catch (e) {
        toast.error(getLang() === "zh" ? "儲存失敗" : "Failed to save");
        return false;
      }
    },
    [callFn],
  );

  const resetMemory = useCallback(async () => {
    try {
      await callFn("?action=reset", { method: "POST" });
      setInsights([]);
      setSessions([]);
      newConversation();
      toast.success(getLang() === "zh" ? "記憶已重置" : "Memory cleared");
    } catch (e) {
      toast.error(getLang() === "zh" ? "重置失敗" : "Failed to reset");
    }
  }, [callFn, newConversation]);

  return {
    messages,
    sending,
    remaining,
    prefs,
    insights,
    sessions,
    loadingHistory,
    send,
    newConversation,
    switchSession,
    deleteSession,
    savePreferences,
    resetMemory,
    sessionId,
  };
}
