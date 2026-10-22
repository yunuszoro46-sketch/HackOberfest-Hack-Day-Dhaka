"use client";

import type { StageErrorBody } from "../server/stage";

/** A stage call that failed; carries the raw model reply when there was one. */
export class StageCallError extends Error {
  constructor(message: string, readonly status: number, readonly raw?: string, readonly detail?: string) {
    super(message);
  }
}

export async function callStage<T>(stage: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/stage/${stage}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new StageCallError("Could not reach the TeamMate server.", 0);
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<StageErrorBody>) | null;
  if (!res.ok || !data) {
    throw new StageCallError(data?.error ?? `The ${stage} stage failed (HTTP ${res.status}).`, res.status, data?.raw, data?.detail);
  }
  return data;
}

export interface Health {
  provider: "gemma" | "gemini" | "mock";
  model: string;
  providerConfigured: boolean;
  search: { configured: boolean; provider: "tavily" | "google-search" | null };
}

export const fetchHealth = () => fetch("/api/health").then((r) => r.json() as Promise<Health>);
