import { useEffect, useState } from "react";
import { evmBalances, stellarBalances } from "../api/balances";
import { fromUnits } from "../utils/amounts";

// "Your RWAs": balances of the listed tokens for the wallet (EVM via Multicall3, Stellar via Horizon).
// Runs only while `active` (screen focused). Result: { [assetId]: "decimal string" }.
export const useRwaHoldings = (assets, evmAddress, stellarAddress, active, refreshKey) => {
  const [holdings, setHoldings] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
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
      setHoldings(out);
      setError(results.some((r) => r === null));
      setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, evmAddress, stellarAddress, assets, refreshKey]);

  return { holdings, loading, error };
};
