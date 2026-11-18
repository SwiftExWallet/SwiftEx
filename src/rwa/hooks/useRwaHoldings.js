import { useEffect, useState } from "react";
import { evmBalances, stellarBalances } from "../api/balances";
import { fromUnits } from "../utils/amounts";

// Last result per wallet (60 s): reopening the screen doesn't re-read ~4,000 balances.
const CACHE_MS = 60000;
const cache = new Map(); // `${evm}|${stellar}|${refreshKey}` -> { at, holdings, error }

// "Your RWAs": balances of the listed tokens for the wallet (EVM via Multicall3, Stellar via Horizon).
// Runs only while `active` (screen focused). Result: { [assetId]: "decimal string" }.
export const useRwaHoldings = (assets, evmAddress, stellarAddress, active, refreshKey) => {
  const ck = `${evmAddress}|${stellarAddress}|${refreshKey}`;
  const hit = cache.get(ck);
  const [holdings, setHoldings] = useState(() => (hit ? hit.holdings : {}));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => (hit ? hit.error : false));

  useEffect(() => {
    if (!active) return undefined;
    const c = cache.get(ck);
    if (c && Date.now() - c.at < CACHE_MS) {
      setHoldings(c.holdings);
      setError(c.error);
      return undefined;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(false);
      const byChain = (c) => assets.filter((a) => a.chain === c);
      const results = await Promise.all([
        evmAddress ? evmBalances("ETH", evmAddress, byChain("ETH")).catch(() => null) : {},
        evmAddress ? evmBalances("BSC", evmAddress, byChain("BSC")).catch(() => null) : {},
        stellarAddress ? stellarBalances(stellarAddress, byChain("XLM")).catch(() => null) : {},
      ]);
      if (cancelled) return;
      const out = {};
      const [eth, bsc, xlm] = results;
      [eth, bsc].forEach((m) => {
        Object.entries(m || {}).forEach(([id, units]) => {
          const a = assets.find((x) => x.id === id);
          if (a) out[id] = fromUnits(units, a.decimals);
        });
      });
      Object.assign(out, xlm || {});
      const err = results.some((r) => r === null);
      if (!err) cache.set(ck, { at: Date.now(), holdings: out, error: false });
      setHoldings(out);
      setError(err);
      setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ck, assets]);

  return { holdings, loading, error };
};
