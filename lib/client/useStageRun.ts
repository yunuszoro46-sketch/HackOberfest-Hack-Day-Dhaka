"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StageCallError } from "./api";

/** Runs one stage call at a time and exposes what is running, for how long, and the last error. */
export function useStageRun() {
  const [running, setRunning] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<StageCallError | null>(null);
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const retryRef = useRef<(() => Promise<void>) | null>(null);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    retryRef.current = () => run(label, fn);
    setRunning(label);
    setLastLabel(label);
    setStartedAt(Date.now());
    setError(null);
    try {
      await fn();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof StageCallError ? err : new StageCallError((err as Error).message, 0));
    } finally {
      setRunning(null);
      setStartedAt(null);
    }
  }, []);

  const retry = useCallback(() => retryRef.current?.(), []);
  const clear = useCallback(() => setError(null), []);
  return { running, startedAt, error, lastLabel, run, retry, clear };
}

/** Seconds since `start`, ticking every second while set. */
export function useElapsed(start: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [start]);
  return start ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
}
