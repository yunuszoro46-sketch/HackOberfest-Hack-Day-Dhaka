import { GoogleProvider } from "./google";

/** Optional provider (LLM_PROVIDER=gemini): JSON mode and Google Search grounding for competitor research. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function createGemini(env: Record<string, string | undefined> = process.env) {
  return new GoogleProvider("gemini", env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL, env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim());
}
