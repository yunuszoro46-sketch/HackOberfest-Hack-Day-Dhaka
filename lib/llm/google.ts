// Google AI Studio through @google/genai. One class serves Gemma (default) and Gemini; they differ in what
// the model accepts: Gemma has no system instruction, no JSON mode and no search tool.
import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import type { LlmProvider, ProviderName, TextRequest, TextResult } from "./types";
import { LlmError } from "./types";

const TIMEOUT_MS = 90_000;

export class GoogleProvider implements LlmProvider {
  readonly configured: boolean;
  readonly supportsSearch: boolean;
  private client: GoogleGenAI | null = null;

  constructor(
    readonly name: Extract<ProviderName, "gemma" | "gemini">,
    readonly model: string,
    private readonly apiKey: string | undefined,
  ) {
    this.configured = Boolean(apiKey);
    this.supportsSearch = name === "gemini";
  }

  async generateText(req: TextRequest): Promise<TextResult> {
    if (!this.apiKey) throw new LlmError("No Google AI Studio key is set (GEMINI_API_KEY).", 503);
    this.client ??= new GoogleGenAI({ apiKey: this.apiKey });
    const gemma = this.name === "gemma";
    const config: GenerateContentConfig = {
      temperature: req.temperature ?? 0.4,
      ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
      abortSignal: req.signal,
      httpOptions: { timeout: TIMEOUT_MS },
    };
    if (gemma) {
      // Gemma 4 thinks at length by default; minimal keeps a stage call to seconds.
      if (this.model.startsWith("gemma-4")) config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
    } else {
      config.systemInstruction = req.system;
      if (req.search) config.tools = [{ googleSearch: {} }];
      else if (req.json) config.responseMimeType = "application/json";
    }
    const text = gemma ? `${req.system}\n\n${req.user}` : req.user;
    let res;
    try {
      res = await this.client.models.generateContent({ model: this.model, contents: [{ role: "user", parts: [{ text }] }], config });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = /\b(429|RESOURCE_EXHAUSTED)\b/.test(msg) ? 429 : /\b(401|403|API key)\b/i.test(msg) ? 502 : 502;
      throw new LlmError(`${this.name} request failed: ${msg.slice(0, 300)}`, status);
    }
    const cand = res.candidates?.[0];
    const out = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
    const urls = (cand?.groundingMetadata?.groundingChunks ?? []).map((c) => c.web?.uri).filter((u): u is string => Boolean(u));
    return {
      text: out,
      usage: { inputTokens: res.usageMetadata?.promptTokenCount, outputTokens: res.usageMetadata?.candidatesTokenCount },
      ...(urls.length ? { groundingUrls: urls } : {}),
    };
  }
}
