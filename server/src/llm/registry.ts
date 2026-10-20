// Reads LLM provider settings from the environment. Nothing here is used unless keys are set;
// the app's default (AGENT_PROVIDER=mock) never makes network calls.
import { z } from 'zod';
import type { BudgetLimits } from './budget';
import { FallbackChain, type ChainMember, type FallbackChainOptions } from './chain';
import { GeminiClient } from './gemini';
import { OpenAICompatibleClient } from './openai-compatible';
import type { LlmClient } from './types';

export const LLM_PROVIDER_IDS = ['groq', 'gemini', 'openrouter', 'ollama'] as const;
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

/** Free-tier models with JSON output, checked against the providers' docs on 2026-10-20. */
export const DEFAULT_LLM_MODELS: Record<LlmProviderId, string> = {
  groq: 'openai/gpt-oss-120b',
  gemini: 'gemini-2.5-flash',
  openrouter: 'nvidia/nemotron-3-super-120b-a12b:free',
  ollama: 'llama3.2',
};

/**
 * Published free-tier request limits (2026-10-20). Groq Free plan: 30 RPM / 1K RPD for gpt-oss-120b.
 * OpenRouter :free models: 20 RPM, 50 RPD (1000 RPD after buying 10 credits; set OPENROUTER_RPD=1000).
 * Gemini free limits are only shown per project in AI Studio, so none are assumed; RPD resets at midnight PT.
 */
export const DEFAULT_LLM_LIMITS: Record<LlmProviderId, BudgetLimits> = {
  groq: { rpm: 30, rpd: 1000 },
  gemini: { dayTimeZone: 'America/Los_Angeles' },
  openrouter: { rpm: 20, rpd: 50 },
  ollama: {},
};

const DEFAULT_ORDER: LlmProviderId[] = ['groq', 'gemini', 'openrouter'];

export interface LlmProviderConfig {
  id: LlmProviderId;
  model: string;
  limits: BudgetLimits;
  /** False when a required key is missing; such providers are left out of the chain. */
  configured: boolean;
  /** Env var to set when not configured. */
  missing?: string;
  apiKey?: string;
  baseUrl?: string;
}

type Env = Record<string, string | undefined>;

const Limit = z.coerce.number().int().positive();

function limitFrom(env: Env, name: string, fallback: number | undefined): number | undefined {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const r = Limit.safeParse(raw);
  if (!r.success) throw new Error(`${name} must be a positive integer`);
  return r.data;
}

/** Ordered provider configs from LLM_PROVIDERS (default "groq,gemini,openrouter"; add "ollama" to use a local server). */
export function loadLlmConfig(env: Env = process.env): LlmProviderConfig[] {
  const listed = env.LLM_PROVIDERS?.trim();
  const ids = listed ? listed.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : DEFAULT_ORDER;
  const seen = new Set<string>();
  return ids.map((id) => {
    if (!(LLM_PROVIDER_IDS as readonly string[]).includes(id)) throw new Error(`LLM_PROVIDERS: unknown provider "${id}" (use ${LLM_PROVIDER_IDS.join(', ')})`);
    if (seen.has(id)) throw new Error(`LLM_PROVIDERS: "${id}" is listed twice`);
    seen.add(id);
    const pid = id as LlmProviderId;
    const P = pid.toUpperCase();
    const defaults = DEFAULT_LLM_LIMITS[pid];
    const limits: BudgetLimits = { ...defaults, rpm: limitFrom(env, `${P}_RPM`, defaults.rpm), rpd: limitFrom(env, `${P}_RPD`, defaults.rpd) };
    if (limits.rpm === undefined) delete limits.rpm;
    if (limits.rpd === undefined) delete limits.rpd;
    const model = env[`${P}_MODEL`]?.trim() || DEFAULT_LLM_MODELS[pid];
    if (pid === 'ollama') {
      const base = env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434';
      return { id: pid, model, limits, configured: true, baseUrl: `${base.replace(/\/+$/, '')}/v1` };
    }
    // The existing Gemma planner key is a Google AI Studio key too.
    const keyVar = `${P}_API_KEY`;
    const apiKey = env[keyVar]?.trim() || (pid === 'gemini' ? env.GEMMA_API_KEY?.trim() : undefined) || undefined;
    return { id: pid, model, limits, configured: Boolean(apiKey), ...(apiKey ? { apiKey } : { missing: keyVar }) };
  });
}

export function createLlmClient(cfg: LlmProviderConfig, fetchImpl?: typeof fetch): LlmClient {
  switch (cfg.id) {
    case 'gemini':
      return new GeminiClient({ apiKey: cfg.apiKey, model: cfg.model, fetchImpl });
    case 'groq':
      return new OpenAICompatibleClient({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: cfg.model, apiKey: cfg.apiKey, fetchImpl });
    case 'openrouter':
      return new OpenAICompatibleClient({ id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: cfg.model, apiKey: cfg.apiKey, fetchImpl, extraHeaders: { 'X-Title': 'TeamMate' } });
    case 'ollama':
      return new OpenAICompatibleClient({ id: 'ollama', baseUrl: cfg.baseUrl!, model: cfg.model, requiresKey: false, fetchImpl });
  }
}

export interface LlmSetup {
  configs: LlmProviderConfig[];
  chain: FallbackChain;
}

/** Chain of the configured providers, in LLM_PROVIDERS order. Empty when no keys are set. */
export function createLlm(env: Env = process.env, opts: FallbackChainOptions & { fetchImpl?: typeof fetch } = {}): LlmSetup {
  const configs = loadLlmConfig(env);
  const members: ChainMember[] = configs.filter((c) => c.configured).map((c) => ({ client: createLlmClient(c, opts.fetchImpl), limits: c.limits }));
  return { configs, chain: new FallbackChain(members, opts) };
}

/** Public view for /api/llm/status: never includes keys or base URLs with credentials. */
export function describeLlm({ configs, chain }: LlmSetup) {
  const live = new Map(chain.status().map((s) => [s.provider, s]));
  return {
    providers: configs.map((c) => ({
      id: c.id,
      model: c.model,
      configured: c.configured,
      ...(c.missing ? { missing: c.missing } : {}),
      limits: { rpm: c.limits.rpm ?? null, rpd: c.limits.rpd ?? null },
      usage: live.get(c.id)?.usage ?? null,
      coolingDownUntil: live.get(c.id)?.coolingDownUntil ?? null,
    })),
  };
}
