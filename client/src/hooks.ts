import { useCallback, useEffect, useRef, useState } from 'react';

export interface Async<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Loads data, optionally polling. `interval` may change between renders (e.g. faster while busy). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], interval?: number | ((d: T | undefined) => number)): Async<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const dataRef = useRef<T | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const d = await fnRef.current();
      dataRef.current = d;
      setData(d);
      setError(null);
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

  return { data, error, loading, reload };
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
