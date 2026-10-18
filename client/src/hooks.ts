import { useCallback, useEffect, useRef, useState } from 'react';

export interface Async<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => Promise<void>;
  /** Time of the last successful load (ms since epoch), for "updated Ns ago" / stale indicators. */
  loadedAt: number | null;
}

/** Loads data, optionally polling. `interval` may change between renders (e.g. faster while busy). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], interval?: number | ((d: T | undefined) => number)): Async<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const dataRef = useRef<T | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const d = await fnRef.current();
      dataRef.current = d;
      setData(d);
      setError(null);
      setLoadedAt(Date.now());
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    dataRef.current = undefined;
    setData(undefined);
    const tick = async () => {
      await reload();
      if (!alive || interval === undefined) return;
      const ms = typeof interval === 'function' ? interval(dataRef.current) : interval;
      timer = setTimeout(tick, ms);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, loadedAt };
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Re-renders every `ms` so relative times stay current. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
