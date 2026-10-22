import { GoogleProvider } from "./google";

/** Default provider: Gemma via Google AI Studio. Model from GEMMA_MODEL. */
export const DEFAULT_GEMMA_MODEL = "gemma-4-26b-a4b-it";

export function createGemma(env: Record<string, string | undefined> = process.env) {
  return new GoogleProvider("gemma", env.GEMMA_MODEL?.trim() || DEFAULT_GEMMA_MODEL, env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim());
}
