import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";

type SahhaAction = "connect" | "fetch_scores" | "fetch_biomarkers" | "disconnect";

interface InvokeResult {
  success: boolean;
  data?: unknown;
  error?: string;
  external_id?: string;
}

export function useSahha(lang: Lang) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const invoke = useCallback(
    async (action: SahhaAction): Promise<InvokeResult | null> => {
      if (!user) return null;
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "sahha-connect",
          { body: { action } },
        );
        if (error || !data?.success) {
          const msg = data?.error || error?.message || "Sahha request failed";
          toast.error(lang === "zh" ? `Sahha 失敗：${msg}` : `Sahha: ${msg}`);
          return null;
        }
        return data as InvokeResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        toast.error(lang === "zh" ? `Sahha 失敗：${msg}` : `Sahha: ${msg}`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user, lang],
  );

  const connect = useCallback(async () => {
    const result = await invoke("connect");
    if (result?.success) {
      toast.success(lang === "zh" ? "已連結 Sahha（測試）" : "Sahha connected (test)");
      return true;
    }
    return false;
  }, [invoke, lang]);

  const fetchScores = useCallback(async () => {
    const result = await invoke("fetch_scores");
    if (result?.success) {
      setLastResult({ kind: "scores", data: result.data });
      toast.success(lang === "zh" ? "已取得分數" : "Scores fetched");
    }
  }, [invoke, lang]);

  const fetchBiomarkers = useCallback(async () => {
    const result = await invoke("fetch_biomarkers");
    if (result?.success) {
      setLastResult({ kind: "biomarkers", data: result.data });
      toast.success(lang === "zh" ? "已取得生物指標" : "Biomarkers fetched");
    }
  }, [invoke, lang]);

  const disconnect = useCallback(async () => {
    const result = await invoke("disconnect");
    if (result?.success) {
      setLastResult(null);
      toast.success(lang === "zh" ? "已中斷 Sahha 連結" : "Sahha disconnected");
      return true;
    }
    return false;
  }, [invoke, lang]);

  return {
    loading,
    lastResult,
    connect,
    fetchScores,
    fetchBiomarkers,
    disconnect,
    clearResult: () => setLastResult(null),
  };
}
