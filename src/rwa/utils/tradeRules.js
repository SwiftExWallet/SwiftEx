// Pure trade rules (unit tested): which pay tokens an asset accepts, minimum order checks.
import { PAY_TOKENS, ONDO_PAY_SYMBOLS, XSTOCKS_MIN_USD } from "../config";

// Ondo GM pairs: USDC only. Others: USDC + USDT on the asset's chain. Stellar: none (Aquarius flow).
export const payOptionsFor = (asset) => {
  if (!asset || !PAY_TOKENS[asset.chain]) return [];
  const all = PAY_TOKENS[asset.chain];
  return asset.issuer === "ondo" ? all.filter((t) => ONDO_PAY_SYMBOLS.includes(t.symbol)) : all;
};

// amount: input string (pay token on buy, asset tokens on sell).
// unitPriceUsd: USD per input token (≈1 for stablecoins on buy; asset price on sell; null if unknown).
// -> { error: string | null }
export const tradeChecks = ({ asset, side, amount, unitPriceUsd }) => {
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n <= 0) return { error: null };
  if (asset && asset.issuer === "xstocks") {
    const usd = side === "buy" ? n * (unitPriceUsd || 1) : unitPriceUsd ? n * unitPriceUsd : null;
    if (usd !== null && usd < XSTOCKS_MIN_USD) return { error: `xStocks orders must be at least $${XSTOCKS_MIN_USD}.` };
  }
  return { error: null };
};
