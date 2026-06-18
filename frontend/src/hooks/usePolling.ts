import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Poll an async fetcher on an interval.
 * Exposes data/loading/error, the last successful update time, and a manual refresh.
 * Guards against setting state after unmount (clears its own interval too).
 * `deps`: when these change, refetch immediately and restart the interval — use it
 * for params like timeframe/symbol so a switch updates the view at once, not on the
 * next tick. (The fetcher itself isn't a dep, so inline non-memoized fetchers are safe.)
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 5000, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      if (!aliveRef.current) return;
      setData(result);
      setError(null);
      setLastUpdated(Date.now());
    } catch (e: any) {
      if (!aliveRef.current) return;
      setError(e?.response?.data?.detail ?? e?.message ?? "request failed");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    const id = intervalMs > 0 ? setInterval(refresh, intervalMs) : undefined;
    return () => {
      aliveRef.current = false;
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, intervalMs, ...deps]);

  return { data, loading, error, lastUpdated, refresh };
}
