// Shared Vertex AI helper - translates OpenAI-style chat completions to Vertex AI generateContent.
// NOTE: Edge functions can't actually share files at runtime in some setups, so this is duplicated inline
// in each function. This file is kept as the canonical reference.

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

const MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
  "google/gemini-2.5-pro": "gemini-2.5-pro",
  "google/gemini-3-flash-preview": "gemini-2.5-flash",
  "google/gemini-3-pro-image-preview": "gemini-2.5-flash",
};

export function mapModel(m?: string): string {
  if (!m) return "gemini-2.5-flash";
  return MODEL_MAP[m] || m.replace(/^google\//, "");
}
