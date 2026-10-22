// One client for every OpenAI-compatible /chat/completions endpoint we use: Groq, OpenRouter, Ollama (/v1).
import { postJson, LLM_TIMEOUT_MS } from './http';
import { validateReply } from './json';
import { LlmError, type JsonRequest, type JsonResult, type LlmClient } from './types';

export interface OpenAICompatibleOptions {
  id: string;
  baseUrl: string;
  model: string;
  /** Omit for keyless local endpoints (Ollama). */
  apiKey?: string;
  requiresKey?: boolean;
  /** Send response_format json_schema when the request has a jsonSchema; otherwise json_object. */
  structuredOutputs?: boolean;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAICompatibleClient implements LlmClient {
  readonly id: string;
  readonly model: string;
  private readonly opts: OpenAICompatibleOptions;

  constructor(opts: OpenAICompatibleOptions) {
    this.id = opts.id;
    this.model = opts.model;
    this.opts = opts;
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const { apiKey, requiresKey = true } = this.opts;
    if (requiresKey && !apiKey) throw new LlmError(this.id, 'NOT_CONFIGURED', 'API key is not set');
    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      { role: 'user', content: req.prompt },
    ];
    const response_format =
      req.jsonSchema && this.opts.structuredOutputs !== false
        ? { type: 'json_schema', json_schema: { name: req.name, strict: true, schema: req.jsonSchema } }
        : { type: 'json_object' };
    const body = {
      model: this.model,
      messages,
      response_format,
      temperature: req.temperature ?? 0.2,
      ...(req.maxOutputTokens ? { max_tokens: req.maxOutputTokens } : {}),
    };
    const headers: Record<string, string> = { ...this.opts.extraHeaders };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const json = (await postJson(
      this.id,
      this.opts.fetchImpl ?? fetch,
      `${this.opts.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      headers,
      body,
      req.timeoutMs ?? this.opts.timeoutMs ?? LLM_TIMEOUT_MS,
      req.signal,
    )) as ChatCompletion;
    const text = json.choices?.[0]?.message?.content ?? '';
    return {
      data: validateReply(this.id, text, req.schema),
      provider: this.id,
      model: this.model,
      usage: { inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens },
    };
  }
}
