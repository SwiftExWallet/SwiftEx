import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchPerpMarkets, fetchTickers24h, primeMarketMeta, cacheTicker } from "../api/asterPublic";
import { asterWs } from "../api/asterWs";

const FLUSH_MS = 1000; // batch live ticker updates into one render per second

// Last good market list (exchangeInfo rules + last tickers), shown instantly on the next open
// while a fresh copy loads. Orders never rely on it alone: OrderPanel refreshes the rules
// first when they are older than 1h (ensureFreshMarketMeta).
const CACHE_KEY = "perps_markets_cache";
const CACHE_VERSION = 1;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // don't show a list older than a week

const readCache = async () => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || c.v !== CACHE_VERSION || !Array.isArray(c.markets) || !c.markets.length) return null;
    if (!(Date.now() - Number(c.fetchedAt) < CACHE_MAX_AGE_MS)) return null;
    return c;
  } catch (e) {
    return null;
  }
};

const writeCache = (markets, fetchedAt) => {
  AsyncStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ v: CACHE_VERSION, fetchedAt, markets })
  ).catch(() => {});
};

// Load exchangeInfo + 24h tickers, merged and sorted by 24h quote volume.
// One shared request at a time (e.g. tab mount + pull-to-refresh).
let inflight = null;
const fetchMarketList = () => {
  if (!inflight) {
    inflight = (async () => {
      const [info, tickers] = await Promise.all([fetchPerpMarkets(), fetchTickers24h()]);
      if (info.error || tickers.error) return { data: null, error: info.error || tickers.error };
      const bySymbol = {};
      tickers.data.forEach((t) => {
        bySymbol[t.symbol] = t;
      });
      const merged = info.data
        .map((m) => ({ ...m, ...(bySymbol[m.symbol] || {}) }))
        .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
      return { data: merged, error: null, fetchedAt: Date.now() };
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
};

// Perp market list + live tickers. Live updates run only while `active` (screen focused).
// Sorted by 24h quote volume (at load; live updates don't reorder rows).
// `updating` = showing the saved list while a fresh one loads.
export const useAsterMarkets = (active) => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef({}); // symbol -> partial ticker from WS
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false); // something (saved or fresh) is on screen
  const hasFreshRef = useRef(false); // a fresh list arrived this session

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (hasDataRef.current) setUpdating(true);
    else setLoading(true);
    const res = await fetchMarketList();
    if (!mountedRef.current) return;
    if (res.error) {
      setError(res.error);
    } else {
      hasDataRef.current = true;
      hasFreshRef.current = true;
      res.data.forEach((m) => cacheTicker(m));
      setMarkets(res.data);
      setError(null);
      writeCache(res.data, res.fetchedAt);
    }
    setLoading(false);
    setRefreshing(false);
    setUpdating(false);
  }, []);

  useEffect(() => {
    // Start the network load right away; show the saved list meanwhile (if it wins the race).
    let firstLoadDone = false;
    load(false).then(() => {
      firstLoadDone = true;
    });
    readCache().then((cached) => {
      if (!cached || !mountedRef.current || hasFreshRef.current) return;
      primeMarketMeta(cached.markets, Number(cached.fetchedAt));
      hasDataRef.current = true;
      cached.markets.forEach((m) => cacheTicker(m, Number(cached.fetchedAt) || 0));
      setMarkets(cached.markets);
      setLoading(false);
      setUpdating(!firstLoadDone);
    });
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
      Object.keys(pending).forEach((s) => cacheTicker({ symbol: s, ...pending[s] }));
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
    updating,
    error,
    retry: () => load(false),
    refresh: () => load(true),
  };
};
