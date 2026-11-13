// Which markets block Multi-Assets, and what the user is asked to do.
import { planMultiAssets, describePlan, summarizeResults, baseOfSymbol } from "../utils/marginModeLogic";

const pos = (symbol, marginType, positionAmt = "0.0") => ({ symbol, marginType, positionAmt });

test("all Cross, no orders -> ready", () => {
  const p = planMultiAssets({ positions: [pos("BTCUSDT", "cross"), pos("ETHUSDT", "cross")], openOrders: [] });
  expect(p.ready).toBe(true);
  expect(describePlan(p).kind).toBe("ready");
});

test("leftover Isolated without position -> switchable (the test-account case)", () => {
  const p = planMultiAssets({ positions: [pos("BTCUSDT", "cross"), pos("XRPUSDT", "isolated", "0.0"), pos("DOGEUSDT", "ISOLATED", "0")], openOrders: [] });
  expect(p.switchable).toEqual(["DOGEUSDT", "XRPUSDT"]);
  expect(p.ready).toBe(false);
  const d = describePlan(p);
  expect(d.kind).toBe("switch");
  expect(d.msg).toMatch(/DOGE and XRP are still set to Isolated/);
});

test("Isolated WITH a position -> blocked, never switched/closed for the user", () => {
  const p = planMultiAssets({ positions: [pos("XRPUSDT", "isolated", "5.9"), pos("DOGEUSDT", "isolated")], openOrders: [] });
  expect(p.withPosition).toEqual(["XRPUSDT"]);
  expect(p.switchable).toEqual(["DOGEUSDT"]);
  const d = describePlan(p);
  expect(d.kind).toBe("blocked");
  expect(d.msg).toMatch(/Close it yourself/);
  // short positions are positions too
  expect(planMultiAssets({ positions: [pos("SOLUSDT", "isolated", "-1")] }).withPosition).toEqual(["SOLUSDT"]);
});

test("Isolated with open orders -> listed for cancel; orders on Cross markets are untouched", () => {
  const orders = [
    { symbol: "XRPUSDT", side: "BUY", type: "LIMIT", price: "0.5", orderId: 1 },
    { symbol: "BTCUSDT", side: "SELL", type: "LIMIT", price: "90000", orderId: 2 },
  ];
  const p = planMultiAssets({ positions: [pos("XRPUSDT", "isolated"), pos("BTCUSDT", "cross")], openOrders: orders });
  expect(p.withOrders).toEqual(["XRPUSDT"]);
  expect(p.blockingOrders.map((o) => o.orderId)).toEqual([1]);
  const d = describePlan(p);
  expect(d.kind).toBe("orders");
  expect(d.msg).toMatch(/XRP buy limit @ 0.5/);
});

test("account-endpoint shape (isolated: true) and duplicates", () => {
  const p = planMultiAssets({ positions: [{ symbol: "XRPUSDT", isolated: true, positionAmt: "0" }, { symbol: "XRPUSDT", isolated: true, positionAmt: "0" }] });
  expect(p.switchable).toEqual(["XRPUSDT"]);
});

test("partial results summary + symbol names", () => {
  const s = summarizeResults([{ symbol: "XRPUSDT", ok: true }, { symbol: "DOGEUSDT", ok: false, error: "x" }]);
  expect(s.ok).toEqual(["XRPUSDT"]);
  expect(s.bad).toHaveLength(1);
  expect(s.allOk).toBe(false);
  expect(baseOfSymbol("1000PEPEUSDT")).toBe("1000PEPE");
});
