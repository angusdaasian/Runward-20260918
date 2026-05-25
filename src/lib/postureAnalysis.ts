import { supabase } from "@/integrations/supabase/client";

type PosturePayload = {
  frames?: string[];
  lang: "en" | "zh";
  translate?: boolean;
  existingResult?: unknown;
};

export async function invokePostureAnalysis<T>(payload: PosturePayload): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Please sign in");
  }

  const { data, error } = await supabase.functions.invoke("analyze-posture", {
    body: payload,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    const functionError = error as Error & { context?: Response };
    if (functionError.context) {
      try {
        const body = await functionError.context.json();
        throw new Error(body?.error || functionError.message || "Request failed");
      } catch {
        throw new Error(functionError.message || "Request failed");
      }
    }

    throw new Error(functionError.message || "Request failed");
  }

  return data as T;
}