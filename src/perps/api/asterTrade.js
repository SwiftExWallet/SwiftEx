// Aster v3 trading calls, all signed by the AGENT key via asterSigned.js.
// Each resolves to { data, error, code, agentInvalid } (never throws).
import { asterSignedRequest } from "./asterSigned";
import { isMarginTypeAlreadySet } from "../utils/asterErrors";

const signed = (agent, user, method, path, params) =>
  asterSignedRequest({ agent, user, method, path, params });

// POST /fapi/v3/order
export const placeOrder = (agent, user, params) => signed(agent, user, "POST", "/fapi/v3/order", params);

// DELETE /fapi/v3/order
export const cancelOrder = (agent, user, { symbol, orderId, origClientOrderId }) =>
  signed(agent, user, "DELETE", "/fapi/v3/order", { symbol, orderId, origClientOrderId });

// GET /fapi/v3/openOrders (all symbols when symbol is omitted)
export const fetchOpenOrders = (agent, user, symbol) =>
  signed(agent, user, "GET", "/fapi/v3/openOrders", symbol ? { symbol } : {});

// GET /fapi/v3/positionRisk
export const fetchPositions = (agent, user, symbol) =>
  signed(agent, user, "GET", "/fapi/v3/positionRisk", symbol ? { symbol } : {});

// GET /fapi/v3/account (balances, totals, positions)
export const fetchAccount = (agent, user) => signed(agent, user, "GET", "/fapi/v3/account", {});

// GET /fapi/v3/commissionRate
export const fetchCommissionRate = (agent, user, symbol) =>
  signed(agent, user, "GET", "/fapi/v3/commissionRate", { symbol });

// GET /fapi/v3/multiAssetsMargin -> { multiAssetsMargin: boolean }. Isolated margin is not
// allowed while Multi-Assets mode is on.
export const fetchMultiAssetsMode = (agent, user) =>
  signed(agent, user, "GET", "/fapi/v3/multiAssetsMargin", {});

// POST /fapi/v3/multiAssetsMargin (account-wide). false = Single-Asset mode.
export const setMultiAssetsMode = (agent, user, enabled) =>
  signed(agent, user, "POST", "/fapi/v3/multiAssetsMargin", { multiAssetsMargin: enabled ? "true" : "false" });

// POST /fapi/v3/leverage
export const setLeverage = (agent, user, symbol, leverage) =>
  signed(agent, user, "POST", "/fapi/v3/leverage", { symbol, leverage: String(leverage) });

// POST /fapi/v3/marginType — "no need to change margin type" counts as success.
export const setMarginType = async (agent, user, symbol, marginType) => {
  const res = await signed(agent, user, "POST", "/fapi/v3/marginType", { symbol, marginType });
  if (res.error && isMarginTypeAlreadySet(res)) return { ...res, error: null, alreadySet: true };
  return res;
};

// Full "open position" flow: leverage / margin type (only when changed) -> entry -> TP/SL.
// TP/SL orders are really sent (closePosition=true, workingType MARK_PRICE) after the entry.
// Returns { ok, step, error, code, entry, tpsl: [{type, ok, error}] }
export const openPosition = async ({
  agent,
  user,
  symbol,
  entryParams,
  tpSlOrders = [],
  leverage,
  leverageChanged,
  marginType,
  marginTypeChanged,
}) => {
  if (marginTypeChanged) {
    const m = await setMarginType(agent, user, symbol, marginType);
    if (m.error) return { ok: false, step: "marginType", error: m.error, code: m.code, agentInvalid: m.agentInvalid };
  }
  if (leverageChanged) {
    const l = await setLeverage(agent, user, symbol, leverage);
    if (l.error) return { ok: false, step: "leverage", error: l.error, code: l.code, agentInvalid: l.agentInvalid };
  }
  const entry = await placeOrder(agent, user, entryParams);
  if (entry.error) {
    return { ok: false, step: "order", error: entry.error, code: entry.code, agentInvalid: entry.agentInvalid };
  }
  const tpsl = [];
  for (const order of tpSlOrders) {
    // Sequential on purpose: keeps nonces ordered and errors per order.
    // eslint-disable-next-line no-await-in-loop
    const r = await placeOrder(agent, user, order);
    tpsl.push({ type: order.type, ok: !r.error, error: r.error, code: r.code });
  }
  return { ok: true, entry: entry.data, tpsl };
};
