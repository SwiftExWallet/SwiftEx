import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPerpMarkets, fetchTickers24h } from "../api/asterPublic";
import { asterWs } from "../api/asterWs";

const FLUSH_MS = 1000; // batch live ticker updates into one render per second

// Perp market list + live tickers. Live updates run only while `active` (screen focused).
// Sorted by 24h quote volume (at load; live updates don't reorder rows).
export const useAsterMarkets = (active) => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef({}); // symbol -> partial ticker from WS
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const [info, tickers] = await Promise.all([fetchPerpMarkets(), fetchTickers24h()]);
    if (!mountedRef.current) return;
    if (info.error || tickers.error) {
      setError(info.error || tickers.error);
    } else {
      const bySymbol = {};
      tickers.data.forEach((t) => {
        bySymbol[t.symbol] = t;
      });
      const merged = info.data
        .map((m) => ({ ...m, ...(bySymbol[m.symbol] || {}) }))
        .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
      setMarkets(merged);
      setError(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    if (!active) return undefined;
    const unsubscribe = asterWs.subscribe("!ticker@arr", (data) => {
      if (!Array.isArray(data)) return;
      data.forEach((t) => {
        pendingRef.current[t.s] = {
          lastPrice: Number(t.c),
          priceChangePercent: Number(t.P),
          quoteVolume: Number(t.q),
          highPrice: Number(t.h),
          lowPrice: Number(t.l),
        };
      });
    });
    const flush = setInterval(() => {
      const pending = pendingRef.current;
      if (Object.keys(pending).length === 0) return;
      pendingRef.current = {};
      setMarkets((prev) =>
        prev.map((m) => (pending[m.symbol] ? { ...m, ...pending[m.symbol] } : m))
      );
    }, FLUSH_MS);
    return () => {
      unsubscribe();
      clearInterval(flush);
      pendingRef.current = {};
    };
  }, [active]);

  return {
    markets,
    loading,
    refreshing,
    error,
    retry: () => load(false),
    refresh: () => load(true),
  };
};
