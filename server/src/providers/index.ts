import type { FallbackChain } from '../llm/chain';
import { GemmaProvider } from './gemma';
import { LlmRunner } from './llm';
import { MockProvider } from './mock';
import type { AgentProvider } from './types';

export interface Providers {
  /** Turns a command into tasks. */
  planner: AgentProvider;
  /** Executes tasks. Its name is stored on every run row. */
  runner: AgentProvider;
  /** Set when the requested mode could not be used, e.g. AGENT_PROVIDER=llm without any model key. */
  warning?: string;
}

/**
 * Selected by AGENT_PROVIDER:
 * - mock (default): rule planner + role templates. No network.
 * - gemma: Gemma plans; role templates execute.
 * - llm: a model plans and builder roles write their files through the LLM chain (Gemini, Groq, OpenRouter, Ollama).
 *   QA and docs stay deterministic. Falls back to mock, with a warning, when no provider is configured.
 */
export function createProviders(kind = process.env.AGENT_PROVIDER ?? 'mock', chain?: FallbackChain): Providers {
  const mock = new MockProvider();
  if (kind === 'gemma') return { planner: new GemmaProvider(), runner: mock };
  if (kind === 'llm') {
    if (chain && chain.providers.length > 0) {
      const llm = new LlmRunner(chain);
      return { planner: llm, runner: llm };
    }
    return { planner: mock, runner: mock, warning: 'AGENT_PROVIDER=llm but no model provider is configured (set GEMINI_API_KEY or another key); using role templates' };
  }
  return { planner: mock, runner: mock };
}
