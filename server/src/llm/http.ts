import { LlmError, type LlmFailure } from './types';

export const LLM_TIMEOUT_MS = 30_000;

export function failureForStatus(status: number): LlmFailure {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 402) return 'QUOTA';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT';
  return 'UPSTREAM';
}

function retryAfter(res: Response): number | undefined {
  const v = res.headers.get('retry-after');
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/**
 * POST JSON with a timeout and the caller's abort signal; returns the parsed body.
 * Errors are mapped to LlmError and never include headers or the response body.
 */
export async function postJson(
  provider: string,
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) throw new LlmError(provider, 'ABORTED', 'cancelled before the request');
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    } catch {
      if (signal?.aborted) throw new LlmError(provider, 'ABORTED', 'cancelled');
      if (ac.signal.aborted) throw new LlmError(provider, 'TIMEOUT', `no response within ${timeoutMs / 1000}s`);
      throw new LlmError(provider, 'NETWORK', 'request failed before a response');
    }
    if (!res.ok) throw new LlmError(provider, failureForStatus(res.status), `HTTP ${res.status}`, retryAfter(res));
    try {
      return await res.json();
    } catch {
      if (signal?.aborted) throw new LlmError(provider, 'ABORTED', 'cancelled');
      throw new LlmError(provider, 'BAD_JSON', 'response body was not JSON');
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
