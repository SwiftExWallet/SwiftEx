// "Where is my position?" — after an order, the success dialog asks the Perps screens to scroll to
// and briefly highlight the new position / open order. One pending request at a time, in memory.
// Plus pure text helpers for the success message, the market "Your position" bar and the banner.
import { useEffect, useState } from "react";
import { gt, sub, toPlain, isPositive, div } from "./decimal";
import { formatNumber, formatPrice } from "./format";
import { unrealizedPnl } from "./orderMath";

const REQUEST_TTL_MS = 20000; // a request nobody could satisfy (row never appeared) expires

let pending = null; // { kind: 'position'|'order', symbol, orderId, strength: 'strong'|'light', at }
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(pending));

export const requestFocus = ({ kind, symbol, orderId = null, strength = "strong" }) => {
  pending = { kind, symbol, orderId: orderId !== null && orderId !== undefined ? String(orderId) : null, strength, at: Date.now() };
  emit();
};
export const getFocusRequest = () => (pending && Date.now() - pending.at <= REQUEST_TTL_MS ? pending : null);
// Called by the screen that showed the highlight.
export const consumeFocus = (req) => {
  if (pending && req && pending.at === req.at) {
    pending = null;
    emit();
  }
};
export const useFocusRequest = () => {
  const [req, setReq] = useState(getFocusRequest());
  useEffect(() => {
    const fn = () => setReq(getFocusRequest());
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return req;
};

// Row keys used by PositionsSection (and matched by focus requests).
export const positionKey = (p) => `${p.symbol}-${p.positionSide || "BOTH"}`;
export const orderKey = (o) => String(o.orderId);
// The row a request points at, or null if it isn't on screen (yet).
export const findFocusTarget = (req, positions, openOrders) => {
  if (!req) return null;
  if (req.kind === "position") {
    const p = (positions || []).find((x) => x.symbol === req.symbol);
    return p ? positionKey(p) : null;
  }
  const o = (openOrders || []).find((x) => (req.orderId ? String(x.orderId) === req.orderId : x.symbol === req.symbol));
  return o ? orderKey(o) : null;
};

const abs = (v) => (gt(v, "0") ? toPlain(v) : sub("0", v));

// "BTC Long 20x · Entry $68,800 · Size 0.001 BTC · Liq. $65,400"
export const positionSummary = (p, baseAsset, tickSize) => {
  if (!p) return null;
  const long = gt(p.positionAmt, "0");
  const lev = Number(p.leverage) || null;
  const parts = [`${baseAsset} ${long ? "Long" : "Short"}${lev ? ` ${lev}x` : ""}`];
  if (isPositive(p.entryPrice)) parts.push(`Entry $${formatPrice(p.entryPrice, tickSize)}`);
  parts.push(`Size ${abs(p.positionAmt)} ${baseAsset}`);
  if (isPositive(p.liquidationPrice)) parts.push(`Liq. $${formatPrice(p.liquidationPrice, tickSize)}`);
  return parts.join(" · ");
};

// "Long 0.001 BTC · +$1.20 (+3.4%)" for the market screen bar. mark = live mark price (optional).
export const positionBarText = (p, baseAsset, mark) => {
  const long = gt(p.positionAmt, "0");
  const lev = Number(p.leverage) || null;
  const notional = abs(p.notional || "0");
  const margin = isPositive(p.isolatedWallet) ? p.isolatedWallet : lev && isPositive(notional) ? div(notional, String(lev)) : null;
  const markPrice = mark !== undefined && mark !== null ? mark : p.markPrice;
  const { pnl, pct } = unrealizedPnl({ positionAmt: p.positionAmt, entryPrice: p.entryPrice, markPrice, margin });
  const side = `${long ? "Long" : "Short"} ${abs(p.positionAmt)} ${baseAsset}`;
  if (pnl === null) return { side, pnl: null, sign: 0 };
  const n = Number(pnl);
  const v = Math.abs(n) < 0.005 ? 0 : n;
  const pctTxt = pct !== null ? ` (${Number(pct) >= 0 || v === 0 ? "+" : "-"}${formatNumber(Math.abs(v === 0 ? 0 : Number(pct)), 1)}%)` : "";
  return { side, pnl: `${v >= 0 ? "+" : "-"}$${formatNumber(Math.abs(v), 2)}${pctTxt}`, sign: Math.sign(v) };
};

// Home banner: "500+ markets · Long or short with leverage". Rounded down (to 50 under 500,
// else to 100) so the copy never overstates; "500+" when the count isn't known yet.
export const marketCountLabel = (n) => {
  const c = Number(n);
  if (!Number.isFinite(c) || c <= 0) return "500+";
  if (c < 50) return `${Math.floor(c)}`;
  const step = c < 500 ? 50 : 100;
  return `${Math.floor(c / step) * step}+`;
};
export const perpsBannerSubtitle = (n) => `${marketCountLabel(n)} markets · Long or short with leverage`;
