// Pure quote maths for the Buy/Sell screen (unit tested).
// side "buy": pay `amountIn` stablecoins, get `out` asset tokens. "sell": pay `amountIn` asset tokens,
// get `out` stablecoins. fee is the provider fee taken in the output token (1inch preset tokenFee).

const num = (x) => (x === null || x === undefined || x === "" ? null : Number(x));

// -> { feePct, effectivePrice, vsMarketPct } (null where unknown).
//  feePct: fee as % of what you'd get without it (fee / (out + fee)).
//  effectivePrice: USD per asset token you actually get/receive (stablecoin ≈ $1).
//  vsMarketPct: how much worse than the market price, in % (positive = you pay more / get less).
export const quoteFigures = ({ side, amountIn, out, fee, marketPrice }) => {
  const a = num(amountIn);
  const o = num(out);
  const f = num(fee) || 0;
  const m = num(marketPrice);
  const feePct = o !== null && o + f > 0 ? (f / (o + f)) * 100 : null;
  let effectivePrice = null;
  if (a && o) effectivePrice = side === "buy" ? a / o : o / a;
  let vsMarketPct = null;
  if (effectivePrice && m) vsMarketPct = side === "buy" ? (effectivePrice / m - 1) * 100 : (1 - effectivePrice / m) * 100;
  return { feePct, effectivePrice, vsMarketPct };
};

// Small-order hint on Ethereum (gas-heavy): below this USD value.
export const ETH_SMALL_ORDER_USD = 500;
export const smallEthOrder = (chain, usdValue) => chain === "ETH" && Number(usdValue) > 0 && Number(usdValue) < ETH_SMALL_ORDER_USD;

// Default chain for a trade: where the user holds the most of the token they'd spend
// (balances in human units by chain), else BNB Chain, else the first chain.
export const defaultChain = (chains, balancesByChain = {}) => {
  let best = null;
  let bestBal = 0;
  chains.forEach((c) => {
    const b = Number(balancesByChain[c] || 0);
    if (b > bestBal) {
      best = c;
      bestBal = b;
    }
  });
  if (best) return best;
  if (chains.includes("BSC")) return "BSC";
  return chains[0] || null;
};
