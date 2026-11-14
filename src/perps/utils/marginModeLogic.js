// Pure decision logic for turning Multi-Assets mode on (no RN imports; unit-tested).
// Aster keeps a margin type PER SYMBOL; Multi-Assets can only be enabled when every symbol is
// CROSSED (-4167) and nothing blocks the switch (open orders: -4171).
// GET /fapi/v3/positionRisk returns every symbol (incl. zero positions) with `marginType`.

const isIsolated = (p) => String(p.marginType || "").toLowerCase() === "isolated" || p.isolated === true || p.isolated === "true";
const hasPosition = (p) => {
  const n = Number(p.positionAmt);
  return Number.isFinite(n) && n !== 0;
};
export const baseOfSymbol = (s) => String(s || "").replace(/(USDT|USDC|USD1)$/, "");

// -> {
//   switchable:   isolated symbols with no position and no open orders (can be set to Cross),
//   withPosition: isolated symbols with an open position (user must close them, never we),
//   withOrders:   isolated symbols with open orders but no position,
//   blockingOrders: open orders on isolated symbols (to cancel, with the user's OK),
//   ready: nothing left to fix -> Multi-Assets can be switched on now
// }
export const planMultiAssets = ({ positions = [], openOrders = [] }) => {
  const ordersBySymbol = new Map();
  openOrders.forEach((o) => {
    if (!o || !o.symbol) return;
    if (!ordersBySymbol.has(o.symbol)) ordersBySymbol.set(o.symbol, []);
    ordersBySymbol.get(o.symbol).push(o);
  });
  const seen = new Set();
  const switchable = [];
  const withPosition = [];
  const withOrders = [];
  positions.forEach((p) => {
    if (!p || !p.symbol || seen.has(p.symbol) || !isIsolated(p)) return;
    seen.add(p.symbol);
    if (hasPosition(p)) withPosition.push(p.symbol);
    else if (ordersBySymbol.has(p.symbol)) withOrders.push(p.symbol);
    else switchable.push(p.symbol);
  });
  const blockingOrders = withOrders.flatMap((s) => ordersBySymbol.get(s));
  return {
    switchable: switchable.sort(),
    withPosition: withPosition.sort(),
    withOrders: withOrders.sort(),
    blockingOrders,
    ready: switchable.length === 0 && withPosition.length === 0 && withOrders.length === 0,
  };
};

const list = (symbols) => {
  const names = symbols.map(baseOfSymbol);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

// User-facing text for the plan's next step. kind: blocked | orders | switch | ready
export const describePlan = (plan) => {
  if (plan.withPosition.length) {
    return {
      kind: "blocked",
      title: "Close Isolated positions first",
      msg: `Multi-Assets needs every market on Cross. You have an open Isolated position in ${list(
        plan.withPosition
      )}. Close it yourself from Positions (or keep it — Multi-Assets then stays off).`,
    };
  }
  if (plan.blockingOrders.length) {
    const lines = plan.blockingOrders
      .slice(0, 8)
      .map((o) => `• ${baseOfSymbol(o.symbol)} ${o.side === "BUY" ? "buy" : "sell"} ${o.type.toLowerCase().replace(/_/g, " ")}${o.price && Number(o.price) ? ` @ ${o.price}` : ""}`)
      .join("\n");
    return {
      kind: "orders",
      title: "Open orders block the switch",
      msg: `${list(plan.withOrders)} ${plan.withOrders.length > 1 ? "are" : "is"} on Isolated with open orders:\n${lines}${
        plan.blockingOrders.length > 8 ? `\n…and ${plan.blockingOrders.length - 8} more` : ""
      }\nCancel ${plan.blockingOrders.length > 1 ? "these orders" : "this order"}, switch to Cross and turn on Multi-Assets?`,
    };
  }
  if (plan.switchable.length) {
    return {
      kind: "switch",
      title: "Turn on Multi-Assets?",
      msg: `${list(plan.switchable)} ${plan.switchable.length > 1 ? "are" : "is"} still set to Isolated (no open position). Switch ${
        plan.switchable.length > 1 ? "them" : "it"
      } to Cross and turn on Multi-Assets? All your Perps assets will then count as Cross margin.`,
    };
  }
  return {
    kind: "ready",
    title: "Turn on Multi-Assets?",
    msg: "All your Perps assets (BNB, ETH, USDC…) will count as Cross margin, at their collateral value. Isolated isn't available in this mode. This applies to all markets.",
  };
};

// Summary after running the steps. results: [{ symbol, ok, error }]
export const summarizeResults = (results) => {
  const ok = results.filter((r) => r.ok).map((r) => r.symbol);
  const bad = results.filter((r) => !r.ok);
  return { ok, bad, allOk: bad.length === 0 };
};
