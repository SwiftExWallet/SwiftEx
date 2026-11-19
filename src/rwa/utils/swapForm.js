// Pure helpers for the simple swap-style Buy/Sell screen (unit tested).
import { nextOpen, formatEastern } from "./marketHours";
import { fmtSig } from "./amounts";

export const QUOTE_DEBOUNCE_MS = 600;
export const QUOTE_REFRESH_MS = 30000; // quotes can be confirmed for 45 s; refresh before that

// Short market text for when trading is NOT open (null when open): "Paused", "Opens Mon 9:30 AM ET".
// usCalendar: the asset follows the US session (Ondo); otherwise only the API's nextChangeAt is used
// (xStocks include non-US listings).
export const closedText = (status, now = new Date(), usCalendar = false) => {
  if (!status || status.open) return null;
  if (status.status === "halted") return "Paused";
  const at = status.nextChangeAt ? new Date(status.nextChangeAt) : usCalendar ? nextOpen(now) : null;
  return at && !Number.isNaN(at.getTime()) && at > now ? `Opens ${formatEastern(at)}` : "Closed";
};

// Digits of a positive number as a plain decimal string (no exponent), floored to maxFrac.
const plain = (n, maxFrac) => {
  if (!Number.isFinite(n) || n <= 0) return "";
  const f = Math.max(0, Math.min(maxFrac, 18));
  const m = 10 ** Math.min(f, 12);
  // floor in two steps to stay inside double precision for 18-decimal tokens
  const s = (Math.floor(n * m) / m).toFixed(Math.min(f, 12));
  return s.replace(/\.?0+$/, "");
};

// USD the user typed -> amount of the token they spend.
// Buy: stablecoin at face value. Sell: asset tokens = usd / price.
export const usdToSpend = ({ side, usd, price, decimals }) => {
  const v = Number(usd);
  if (!usd || !Number.isFinite(v) || v <= 0) return "";
  if (side === "buy") return plain(v, Math.min(decimals, 6));
  if (!price || !Number.isFinite(price) || price <= 0) return "";
  return plain(v / price, Math.min(decimals, 8));
};

// Amount of the spent token -> USD (for Max and the "≈ $" line).
export const spendToUsd = ({ side, amount, price }) => {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return null;
  if (side === "buy") return a;
  return price && price > 0 ? a * price : null;
};

// Pick chain + pay token automatically. balances: { [chain]: { [paySymbol]: number, asset: number } }.
// Buy: the (chain, stablecoin) with the most balance. Sell: the chain holding the most of the asset,
// paired with the first pay option there. Nothing held -> BNB Chain, first option.
export const pickRoute = ({ side, chains, payOptionsByChain, balances = {} }) => {
  let best = null;
  let bestBal = 0;
  chains.forEach((c) => {
    const opts = payOptionsByChain[c] || [];
    if (!opts.length) return;
    if (side === "buy") {
      opts.forEach((p) => {
        const b = Number((balances[c] || {})[p.symbol] || 0);
        if (b > bestBal) {
          best = { chain: c, paySym: p.symbol };
          bestBal = b;
        }
      });
    } else {
      const b = Number((balances[c] || {}).asset || 0);
      if (b > bestBal) {
        best = { chain: c, paySym: opts[0].symbol };
        bestBal = b;
      }
    }
  });
  if (best) return best;
  const c = chains.includes("BSC") ? "BSC" : chains.find((x) => (payOptionsByChain[x] || []).length);
  return c ? { chain: c, paySym: payOptionsByChain[c][0].symbol } : null;
};

// "1 AAPLx = $358.39" from what the user pays and gets (USD per asset token).
export const rateText = ({ side, symbol, amountIn, amountOut }) => {
  const i = Number(amountIn);
  const o = Number(amountOut);
  if (!(i > 0) || !(o > 0)) return null;
  const px = side === "buy" ? i / o : o / i;
  return `1 ${symbol} = $${px >= 1 ? px.toFixed(2) : fmtSig(px, 4)}`;
};

// Inline error under the amount (first that applies), or null.
export const amountError = ({ ruleError, insufficient, spendSymbol, lowGas, nativeSymbol }) => {
  if (ruleError) return ruleError;
  if (insufficient) return `Not enough ${spendSymbol}`;
  if (lowGas) return `Not enough ${nativeSymbol} for the network fee`;
  return null;
};

// Holdings: never show exponent notation ("7.3e-7" used to render as "7.32"), and treat
// leftovers worth under a cent as dust (hidden from "Your holdings" / "Your balance").
export const fmtHolding = (n, maxFrac = 6) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(Math.max(maxFrac, 8)).replace(/\.?0+$/, "");
  const [i, f = ""] = s.split(".");
  const fr = f.slice(0, maxFrac).replace(/0+$/, "");
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fr ? `${int}.${fr}` : int === "0" && v > 0 ? `<${(10 ** -maxFrac).toFixed(maxFrac)}` : int;
};
export const isDust = (amount, price) => {
  const v = Number(amount);
  if (!(v > 0)) return true;
  return price && price > 0 ? v * price < 0.01 : v < 1e-6;
};
