import { useCallback, useEffect, useState } from "react";
import {
  fetchPremiumIndex,
  fetchTickers24h,
  getCachedTicker,
  getCachedPremium,
  cacheTicker,
  cachePremium,
} from "../api/asterPublic";
import { asterWs } from "../api/asterWs";

// 24h ticker + mark price / funding for one symbol, live via WS while `active`.
// Starts from the last known values (market list / previous visit) so the screen has a price
// immediately; REST + WS replace them within a moment.
export const useAsterSymbolStats = (symbol, active) => {
  const [ticker, setTicker] = useState(() => (symbol ? getCachedTicker(symbol) : null));
  const [premium, setPremium] = useState(() => (symbol ? getCachedPremium(symbol) : null));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!symbol) return;
    const [t, p] = await Promise.all([fetchTickers24h(symbol), fetchPremiumIndex(symbol)]);
    if (t.data) {
      cacheTicker(t.data);
      setTicker(t.data);
    }
    if (p.data) {
      cachePremium(symbol, p.data);
      setPremium(p.data);
    }
    setError(t.error || p.error || null);
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!active || !symbol) return undefined;
    const offTicker = asterWs.subscribe("!ticker@arr", (data) => {
      const t = Array.isArray(data) && data.find((x) => x.s === symbol);
      if (!t) return;
      const next = {
        symbol,
        lastPrice: Number(t.c),
        priceChangePercent: Number(t.P),
        quoteVolume: Number(t.q),
        highPrice: Number(t.h),
        lowPrice: Number(t.l),
      };
      cacheTicker(next);
      setTicker(next);
    });
    const offMark = asterWs.subscribe("!markPrice@arr@1s", (data) => {
      const m = Array.isArray(data) && data.find((x) => x.s === symbol);
      if (!m) return;
      const next = {
        markPrice: Number(m.p),
        fundingRate: Number(m.r),
        nextFundingTime: Number(m.T),
      };
      cachePremium(symbol, next);
      setPremium(next);
    });
    return () => {
      offTicker();
      offMark();
    };
  }, [symbol, active]);

  return { ticker, premium, error, retry: load };
};
