// Google AI Studio via the native Gemini API: POST /v1beta/models/<model>:generateContent, key in x-goog-api-key.
// Gemini models get JSON mode (responseMimeType + responseJsonSchema); Gemma models do not support it,
// so for them the reply text is parsed tolerantly.
import { postJson, LLM_TIMEOUT_MS } from './http';
import { validateReply } from './json';
import { LlmError, type JsonRequest, type JsonResult, type LlmClient } from './types';

export interface GeminiOptions {
  apiKey?: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GeminiClient implements LlmClient {
  readonly id = 'gemini';
  readonly model: string;
  private readonly opts: GeminiOptions;

  constructor(opts: GeminiOptions) {
    this.model = opts.model;
    this.opts = opts;
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    if (!this.opts.apiKey) throw new LlmError(this.id, 'NOT_CONFIGURED', 'API key is not set');
    const isGemma = this.model.startsWith('gemma');
    const generationConfig: Record<string, unknown> = { temperature: req.temperature ?? 0.2 };
    if (req.maxOutputTokens) generationConfig.maxOutputTokens = req.maxOutputTokens;
    if (isGemma) {
      if (this.model.startsWith('gemma-4')) generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
    } else {
      generationConfig.responseMimeType = 'application/json';
      if (req.jsonSchema) generationConfig.responseJsonSchema = req.jsonSchema;
    }
    // Gemma has no system instruction support; fold it into the prompt for every model to keep one shape.
    const text = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
    const json = (await postJson(
      this.id,
      this.opts.fetchImpl ?? fetch,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { 'x-goog-api-key': this.opts.apiKey },
      { contents: [{ role: 'user', parts: [{ text }] }], generationConfig },
      req.timeoutMs ?? this.opts.timeoutMs ?? LLM_TIMEOUT_MS,
      req.signal,
    )) as GenerateContentResponse;
    const reply = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
    return {
      data: validateReply(this.id, reply, req.schema),
      provider: this.id,
      model: this.model,
      usage: { inputTokens: json.usageMetadata?.promptTokenCount, outputTokens: json.usageMetadata?.candidatesTokenCount },
    };
  }
}
