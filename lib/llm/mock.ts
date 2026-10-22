// LLM_PROVIDER=mock: deterministic canned replies per stage, for tests and for running the demo with no key.
// Everything it returns is labelled "mock" in the UI through the provider name.
import type { LlmProvider, TextRequest, TextResult } from "./types";

export type MockResponder = (req: TextRequest, attempt: number) => string;

const responders = new Map<string, MockResponder>();

/** Stages register their canned reply here (see lib/llm/mockReplies.ts). */
export function registerMock(stage: string, responder: MockResponder) {
  responders.set(stage, responder);
}

export class MockProvider implements LlmProvider {
  readonly name = "mock" as const;
  readonly model = "mock-1";
  readonly configured = true;
  readonly supportsSearch = false;
  private readonly attempts = new Map<string, number>();

  async generateText(req: TextRequest): Promise<TextResult> {
    const responder = responders.get(req.stage);
    if (!responder) throw new Error(`No mock reply registered for stage "${req.stage}"`);
    const key = `${req.stage}:${req.user.length}`;
    const attempt = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, attempt);
    return { text: responder(req, attempt), usage: { inputTokens: Math.ceil((req.system.length + req.user.length) / 4), outputTokens: 0 } };
  }
}
