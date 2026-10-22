// The one door to a language model. Every structured reply is validated with Zod; a reply that fails is retried
// once with the validation error appended, and a second failure becomes a 422 carrying the raw text.
import type { z } from "zod";
import { createGemini } from "./gemini";
import { createGemma } from "./gemma";
import { extractHtml, extractJson } from "./json";
import { MockProvider } from "./mock";
import { LlmError, type LlmProvider, type ProviderName, type TextRequest } from "./types";
import { logStage } from "../server/log";

let cached: { key: string; provider: LlmProvider } | null = null;

/** Provider from LLM_PROVIDER (gemma | gemini | mock); default gemma. */
export function getProvider(env: Record<string, string | undefined> = process.env): LlmProvider {
  const name = (env.LLM_PROVIDER?.trim().toLowerCase() || "gemma") as ProviderName;
  const key = `${name}|${env.GEMMA_MODEL}|${env.GEMINI_MODEL}|${Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY)}`;
  if (cached?.key === key) return cached.provider;
  const provider = name === "gemini" ? createGemini(env) : name === "mock" ? new MockProvider() : createGemma(env);
  cached = { key, provider };
  return provider;
}

export interface GenerateOptions<T> {
  stage: string;
  system: string;
  user: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  search?: boolean;
  temperature?: number;
  signal?: AbortSignal;
  provider?: LlmProvider;
}

export interface Generated<T> {
  data: T;
  raw: string;
  provider: ProviderName;
  model: string;
  groundingUrls: string[];
}

const describeIssues = (err: z.ZodError) => err.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");

/** Structured generation: JSON reply → Zod → one retry with the error → 422. */
export async function generate<T>(opts: GenerateOptions<T>): Promise<Generated<T>> {
  const provider = opts.provider ?? getProvider();
  let user = opts.user;
  let lastRaw = "";
  let lastError = "";
  const urls: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const req: TextRequest = { stage: opts.stage, system: opts.system, user, json: true, search: opts.search, temperature: opts.temperature, signal: opts.signal };
    const started = Date.now();
    let res;
    try {
      res = await provider.generateText(req);
    } catch (err) {
      logStage({ stage: opts.stage, provider: provider.name, model: provider.model, latencyMs: Date.now() - started, ok: false, attempt, error: (err as Error).message });
      throw err instanceof LlmError ? err : new LlmError((err as Error).message, 502);
    }
    lastRaw = res.text;
    urls.push(...(res.groundingUrls ?? []));
    let parsed: unknown;
    let problem: string | null = null;
    try {
      parsed = extractJson(res.text);
    } catch (err) {
      problem = `Your reply was not valid JSON (${(err as Error).message}).`;
    }
    if (!problem) {
      const result = opts.schema.safeParse(parsed);
      if (result.success) {
        logStage({ stage: opts.stage, provider: provider.name, model: provider.model, latencyMs: Date.now() - started, ok: true, attempt, ...res.usage });
        return { data: result.data, raw: res.text, provider: provider.name, model: provider.model, groundingUrls: [...new Set(urls)] };
      }
      problem = `Your JSON did not match the schema: ${describeIssues(result.error)}.`;
    }
    lastError = problem;
    logStage({ stage: opts.stage, provider: provider.name, model: provider.model, latencyMs: Date.now() - started, ok: false, attempt, error: problem, ...res.usage });
    user = `${opts.user}\n\nYour previous reply could not be used. ${problem} Reply again with only the corrected JSON object.`;
  }
  throw new LlmError(`The model's reply did not match the expected shape after a retry. ${lastError}`, 422, lastRaw, lastError);
}

export interface GeneratedHtml {
  html: string;
  raw: string;
  provider: ProviderName;
  model: string;
}

/** HTML generation (the previewer). `validate` returns a problem description, or null when the HTML is usable. */
export async function generateHtml(opts: Omit<GenerateOptions<unknown>, "schema"> & { validate: (html: string) => string | null }): Promise<GeneratedHtml> {
  const provider = opts.provider ?? getProvider();
  let user = opts.user;
  let lastRaw = "";
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    let res;
    try {
      res = await provider.generateText({ stage: opts.stage, system: opts.system, user, temperature: opts.temperature, signal: opts.signal, maxOutputTokens: 16_000 });
    } catch (err) {
      logStage({ stage: opts.stage, provider: provider.name, model: provider.model, latencyMs: Date.now() - started, ok: false, attempt, error: (err as Error).message });
      throw err instanceof LlmError ? err : new LlmError((err as Error).message, 502);
    }
    lastRaw = res.text;
    const html = extractHtml(res.text);
    const problem = opts.validate(html);
    logStage({ stage: opts.stage, provider: provider.name, model: provider.model, latencyMs: Date.now() - started, ok: !problem, attempt, ...(problem ? { error: problem } : {}), ...res.usage });
    if (!problem) return { html, raw: res.text, provider: provider.name, model: provider.model };
    lastError = problem;
    user = `${opts.user}\n\nYour previous reply could not be used: ${problem} Reply again with only the corrected HTML document.`;
  }
  throw new LlmError(`The generated HTML was not usable after a retry. ${lastError}`, 422, lastRaw, lastError);
}
