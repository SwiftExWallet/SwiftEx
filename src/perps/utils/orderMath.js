// Pure order building / validation for Aster perps (no React Native imports: unit-testable).
import {
  toPlain,
  isPositive,
  isValid,
  mul,
  div,
  sub,
  gt,
  lt,
  gte,
  floorToStep,
  ceilToStep,
  roundToStep,
  fromUnits,
  toUnits,
} from "./decimal";

export const DEFAULT_TAKER_FEE_RATE = "0.0004"; // 0.04% until the API gives the user's commission
export const DEFAULT_MAX_LEVERAGE = 20; // until leverageBracket is readable (needs a deposit)

const opposite = (side) => (side === "BUY" ? "SELL" : "BUY");
export const sideFor = (direction) => (direction === "LONG" ? "BUY" : "SELL");

export const newClientOrderId = () =>
  `swx-${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`.slice(0, 36);

// Build the entry order.
// input: { symbol, direction: 'LONG'|'SHORT', type: 'MARKET'|'LIMIT', margin (USDT string),
//          leverage (int), markPrice, limitPrice, meta: { tickSize, stepSize, marketStepSize, minQty, minNotional } }
// returns { ok, error, qty, price, notional, marginUsed, params }
export const buildEntryOrder = (input) => {
  const { symbol, direction, type, margin, leverage, markPrice, limitPrice, meta = {} } = input;
  const fail = (error) => ({ ok: false, error });

  if (!isPositive(margin)) return fail("Enter an amount");
  const lev = Number(leverage);
  if (!Number.isInteger(lev) || lev < 1) return fail("Invalid leverage");
  if (!meta.tickSize || !meta.stepSize) return fail("Market details not loaded yet");

  let price;
  if (type === "LIMIT") {
    if (!isPositive(limitPrice)) return fail("Enter a limit price");
    price = roundToStep(limitPrice, meta.tickSize);
    if (!isPositive(price)) return fail("Limit price is too small");
    // Aster PERCENT_PRICE band: price must be within mark × [down, up].
    const mark = toPlain(markPrice);
    if (isPositive(mark) && isPositive(meta.priceBandDown) && isPositive(meta.priceBandUp)) {
      const low = ceilToStep(mul(mark, meta.priceBandDown), meta.tickSize);
      const high = floorToStep(mul(mark, meta.priceBandUp), meta.tickSize);
      if (lt(price, low) || gt(price, high)) {
        return fail(`Limit price must be between $${low} and $${high} right now`);
      }
    }
  } else {
    if (!isPositive(toPlain(markPrice))) return fail("Price not available yet");
    price = toPlain(markPrice);
  }

  const step = type === "MARKET" ? meta.marketStepSize || meta.stepSize : meta.stepSize;
  const notionalWanted = mul(margin, String(lev));
  const qty = floorToStep(div(notionalWanted, price), step);

  if (meta.minQty && lt(qty, meta.minQty)) {
    const minMargin = div(mul(meta.minQty, price), String(lev));
    return fail(`Amount too small. Minimum about $${ceilToStep(minMargin, "0.01")} at ${lev}x`);
  }
  if (!isPositive(qty)) return fail("Amount too small");
  const notional = mul(qty, price);
  if (meta.minNotional && lt(notional, meta.minNotional)) {
    const minMargin = div(meta.minNotional, String(lev));
    return fail(`Order size must be at least $${meta.minNotional} (about $${ceilToStep(minMargin, "0.01")} at ${lev}x)`);
  }

  const params = {
    symbol,
    side: sideFor(direction),
    positionSide: "BOTH",
    type,
    quantity: qty,
    newClientOrderId: newClientOrderId(),
  };
  if (type === "LIMIT") {
    params.price = price;
    params.timeInForce = "GTC";
  }
  return {
    ok: true,
    error: null,
    qty,
    price,
    notional,
    marginUsed: div(notional, String(lev)),
    params,
  };
};

// Validate TP/SL against the entry price and build the closePosition orders.
// LONG: TP > entry > SL. SHORT: TP < entry < SL.
export const buildTpSlOrders = ({ symbol, direction, entryPrice, tp, sl, tickSize }) => {
  const orders = [];
  const errors = [];
  const closeSide = opposite(sideFor(direction));
  const isLong = direction === "LONG";
  const check = (label, raw, type, mustBeAbove) => {
    if (raw === undefined || raw === null || String(raw).trim() === "") return;
    if (!isPositive(raw)) {
      errors.push(`${label} price is invalid`);
      return;
    }
    const stopPrice = roundToStep(raw, tickSize);
    const okSide = mustBeAbove ? gt(stopPrice, entryPrice) : lt(stopPrice, entryPrice);
    if (!okSide) {
      errors.push(`${label} must be ${mustBeAbove ? "above" : "below"} the entry price for a ${isLong ? "long" : "short"}`);
      return;
    }
    orders.push({
      symbol,
      side: closeSide,
      positionSide: "BOTH",
      type,
      stopPrice,
      closePosition: "true",
      workingType: "MARK_PRICE",
      newClientOrderId: newClientOrderId(),
    });
  };
  check("Take profit", tp, "TAKE_PROFIT_MARKET", isLong);
  check("Stop loss", sl, "STOP_MARKET", !isLong);
  return { ok: errors.length === 0, errors, orders };
};

// Market close of a whole one-way position (positionAmt > 0 long, < 0 short).
// Uses Aster's positionAmt as-is (already a valid quantity) so no dust is left behind.
export const buildCloseOrder = ({ symbol, positionAmt }) => {
  if (!isValid(positionAmt) || toUnits(positionAmt).isZero()) return null;
  const isLong = gt(positionAmt, "0");
  const abs = isLong ? toPlain(positionAmt) : sub("0", positionAmt);
  return {
    symbol,
    side: isLong ? "SELL" : "BUY",
    positionSide: "BOTH",
    type: "MARKET",
    quantity: abs,
    reduceOnly: "true",
    newClientOrderId: newClientOrderId(),
  };
};

export const estimateFee = (notional, feeRate = DEFAULT_TAKER_FEE_RATE) =>
  isPositive(notional) ? mul(notional, feeRate) : "0";

// Unrealized PnL for a one-way position at a mark price, and % of the position's margin.
export const unrealizedPnl = ({ positionAmt, entryPrice, markPrice, margin }) => {
  if (!isValid(positionAmt) || !isPositive(entryPrice) || !isPositive(toPlain(markPrice))) {
    return { pnl: null, pct: null };
  }
  const pnl = mul(positionAmt, sub(toPlain(markPrice), entryPrice));
  const pct = isPositive(margin) ? mul(div(pnl, margin), "100") : null;
  return { pnl, pct };
};

export const fmtFixed = (value, decimals) => (isValid(value) ? fromUnits(toUnits(value), decimals) : "—");
export const nonNegative = (value) => (isValid(value) && gte(value, "0") ? value : "0");
