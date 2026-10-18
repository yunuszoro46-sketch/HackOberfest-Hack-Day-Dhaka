import { GemmaProvider } from './gemma';
import { MockProvider } from './mock';
import type { AgentProvider } from './types';

export interface Providers {
  /** Turns a command into tasks. */
  planner: AgentProvider;
  /** Executes tasks. Its name is stored on every run row. */
  runner: AgentProvider;
}

/** Selected by AGENT_PROVIDER=mock|gemma (D1). Gemma plans; the mock role templates always execute (D2). */
export function createProviders(kind = process.env.AGENT_PROVIDER ?? 'mock'): Providers {
  const mock = new MockProvider();
  if (kind === 'gemma') return { planner: new GemmaProvider(), runner: mock };
  return { planner: mock, runner: mock };
}
