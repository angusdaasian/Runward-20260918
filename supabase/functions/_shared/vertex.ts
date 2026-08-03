// Shared Vertex AI helper - translates OpenAI-style chat completions to Vertex AI generateContent.
// NOTE: Edge functions can't actually share files at runtime in some setups, so this is duplicated inline
// in each function. This file is kept as the canonical reference.

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

const MODEL_MAP: Record<string, string> = {
  "google/gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
  "google/gemini-3.1-flash-preview": "gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite-preview": "gemini-flash-lite-latest",
  "google/gemini-3-flash-preview": "gemini-3-flash-preview",
  "google/gemini-3-pro-image-preview": "gemini-3-flash-preview",
};

export function mapModel(m?: string): string {
  if (!m) return "gemini-flash-lite-latest";
  return MODEL_MAP[m] || m.replace(/^google\//, "");
}
