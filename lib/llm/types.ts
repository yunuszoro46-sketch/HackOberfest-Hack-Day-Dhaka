export type ProviderName = "gemma" | "gemini" | "mock";

export interface TextRequest {
  /** Which pipeline stage is asking; used for logs and by the mock provider. */
  stage: string;
  system: string;
  user: string;
  /** Ask for a JSON reply (providers that support a JSON mode use it). */
  json?: boolean;
  /** Use the provider's own web search grounding when it has one (Gemini only). */
  search?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface TextResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** Sources the provider's search grounding actually returned (uri + site title/domain), if any. */
  groundingSources?: { uri: string; title: string }[];
}

export interface LlmProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** False when the API key is missing; calls then fail with a 503. */
  readonly configured: boolean;
  readonly supportsSearch: boolean;
  generateText(req: TextRequest): Promise<TextResult>;
}

/** A failure the route turns into an HTTP error with the raw model text attached for the UI. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly raw?: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}
