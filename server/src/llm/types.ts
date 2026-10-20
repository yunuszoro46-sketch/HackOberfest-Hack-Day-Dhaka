import type { z } from 'zod';

/** Short, safe failure reasons. Never contain a key or a raw response body. */
export type LlmFailure =
  | 'NOT_CONFIGURED'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'QUOTA'
  | 'BUDGET'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'MODEL_NOT_FOUND'
  | 'UPSTREAM'
  | 'BAD_JSON'
  | 'SCHEMA'
  | 'ABORTED';

export class LlmError extends Error {
  readonly reason: LlmFailure;
  readonly provider: string;
  /** Seconds the provider asked us to wait (Retry-After), when it said so. */
  readonly retryAfterSec?: number;
  constructor(provider: string, reason: LlmFailure, detail: string, retryAfterSec?: number) {
    super(`${provider}: ${reason} (${detail})`);
    this.provider = provider;
    this.reason = reason;
    this.retryAfterSec = retryAfterSec;
  }
}

export interface JsonRequest<T> {
  /** Name used for the schema in provider requests, e.g. "critique". [a-zA-Z0-9_-] only. */
  name: string;
  system?: string;
  prompt: string;
  /** Validates the parsed reply. The reply is rejected with SCHEMA if it does not match. */
  schema: z.ZodType<T, any, any>;
  /** Optional JSON Schema sent to providers that support schema-constrained output. */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface JsonResult<T> {
  data: T;
  /** Provider id, e.g. "groq". */
  provider: string;
  model: string;
  usage: LlmUsage;
}

export interface LlmClient {
  /** Provider id, e.g. "groq". */
  readonly id: string;
  readonly model: string;
  generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>>;
}
