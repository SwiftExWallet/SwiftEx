import { useCallback, useEffect, useRef, useState } from "react";
import { fetchKlines } from "../api/asterPublic";
import { asterWs } from "../api/asterWs";

const MAX_CANDLES = 200;

// Last candles per symbol/interval (this app session), shown immediately on the next visit
// while fresh ones load. Chart display only.
const candleCache = new Map();
const cacheKey = (symbol, interval) => `${symbol}|${interval}`;

// Candles for one symbol/interval; the last candle updates live via WS while `active`.
export const useAsterKlines = (symbol, interval, active) => {
  const [candles, setCandles] = useState(() => (symbol && candleCache.get(cacheKey(symbol, interval))) || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!symbol) return;
    const requestId = ++requestRef.current;
    const key = cacheKey(symbol, interval);
    const cached = candleCache.get(key);
    if (cached) setCandles(cached); // interval switch: show what we had, then refresh
    setLoading(true);
    const { data, error: err } = await fetchKlines(symbol, interval, MAX_CANDLES);
    if (requestId !== requestRef.current) return; // a newer request (interval change) won
    if (err) {
      setError(err);
    } else {
      candleCache.set(key, data);
      setCandles(data);
      setError(null);
    }
    setLoading(false);
  }, [symbol, interval]);

  useEffect(() => {
    load();
    return () => {
      requestRef.current += 1; // ignore late responses after unmount / change
    };
  }, [load]);

  useEffect(() => {
    if (!active || !symbol) return undefined;
    const key = cacheKey(symbol, interval);
    const stream = `${symbol.toLowerCase()}@kline_${interval}`;
    return asterWs.subscribe(stream, (data) => {
      const k = data && data.k;
      if (!k) return;
      const candle = {
        t: Number(k.t),
        o: Number(k.o),
        h: Number(k.h),
        l: Number(k.l),
        c: Number(k.c),
        v: Number(k.v),
      };
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        let next = prev;
        if (candle.t === last.t) next = [...prev.slice(0, -1), candle];
        else if (candle.t > last.t) next = [...prev, candle].slice(-MAX_CANDLES);
        if (next !== prev) candleCache.set(key, next);
        return next;
      });
    });
  }, [symbol, interval, active]);

  return { candles, loading, error, retry: load };
};
