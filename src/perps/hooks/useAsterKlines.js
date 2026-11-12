import { useCallback, useEffect, useRef, useState } from "react";
import { fetchKlines } from "../api/asterPublic";
import { asterWs } from "../api/asterWs";

const MAX_CANDLES = 200;

// Candles for one symbol/interval; the last candle updates live via WS while `active`.
export const useAsterKlines = (symbol, interval, active) => {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!symbol) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    const { data, error: err } = await fetchKlines(symbol, interval, MAX_CANDLES);
    if (requestId !== requestRef.current) return; // a newer request (interval change) won
    if (err) {
      setError(err);
    } else {
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
        if (candle.t === last.t) return [...prev.slice(0, -1), candle];
        if (candle.t > last.t) return [...prev, candle].slice(-MAX_CANDLES);
        return prev;
      });
    });
  }, [symbol, interval, active]);

  return { candles, loading, error, retry: load };
};
