/** One JSON line per model call: stage, provider, latency, tokens, outcome. Never prompts or keys. */
export interface StageLog {
  stage: string;
  provider: string;
  model: string;
  latencyMs: number;
  ok: boolean;
  attempt?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export function logStage(entry: StageLog) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  const line = JSON.stringify({ at: new Date().toISOString(), kind: "llm", ...entry, ...(entry.error ? { error: entry.error.slice(0, 300) } : {}) });
  if (entry.ok) console.log(line);
  else console.warn(line);
}
