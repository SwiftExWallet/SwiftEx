// "Where is my position?": success text, market bar text, focus requests, banner copy.
const F = require("../utils/positionFocus");

const BTC_LONG = {
  symbol: "BTCUSDT",
  positionSide: "BOTH",
  positionAmt: "0.001",
  entryPrice: "68800",
  markPrice: "68900",
  liquidationPrice: "65400",
  leverage: "20",
  notional: "68.9",
  isolatedWallet: "0",
};

test("success text shows side, leverage, entry, size and liq. price", () => {
  expect(F.positionSummary(BTC_LONG, "BTC", "0.1")).toBe("BTC Long 20x · Entry $68,800.0 · Size 0.001 BTC · Liq. $65,400.0");
});

test("short position, no liq. price known", () => {
  const p = { ...BTC_LONG, positionAmt: "-12", entryPrice: "1.03", liquidationPrice: "0", leverage: "5" };
  const s = F.positionSummary(p, "XRP", "0.0001");
  expect(s).toMatch(/^XRP Short 5x · Entry \$1\.03/);
  expect(s).toMatch(/Size 12 XRP$/);
});

test("market bar: side, size, live PnL and ROE", () => {
  const t = F.positionBarText(BTC_LONG, "BTC", 70000); // +1.2 on 0.001 BTC; margin 68.9/20
  expect(t.side).toBe("Long 0.001 BTC");
  expect(t.pnl).toBe("+$1.20 (+34.8%)");
  expect(t.sign).toBe(1);
  const loss = F.positionBarText(BTC_LONG, "BTC", 68000);
  expect(loss.pnl).toMatch(/^-\$0\.80 \(-/);
  expect(loss.sign).toBe(-1);
});

test("market bar: tiny PnL is shown as +$0.00, never a red -$0.00", () => {
  const t = F.positionBarText(BTC_LONG, "BTC", 68801);
  expect(t.pnl).toMatch(/^\+\$0\.00/);
  expect(t.sign).toBe(0);
});

test("focus target: position by symbol, order by id (or symbol)", () => {
  const orders = [{ orderId: 11, symbol: "XRPUSDT" }, { orderId: 12, symbol: "XRPUSDT" }];
  expect(F.findFocusTarget({ kind: "position", symbol: "BTCUSDT" }, [BTC_LONG], [])).toBe("BTCUSDT-BOTH");
  expect(F.findFocusTarget({ kind: "position", symbol: "ETHUSDT" }, [BTC_LONG], [])).toBeNull();
  expect(F.findFocusTarget({ kind: "order", symbol: "XRPUSDT", orderId: "12" }, [], orders)).toBe("12");
  expect(F.findFocusTarget({ kind: "order", symbol: "XRPUSDT", orderId: null }, [], orders)).toBe("11");
  expect(F.findFocusTarget(null, [BTC_LONG], orders)).toBeNull();
});

test("focus request: one at a time, consumed once, expires", () => {
  jest.useFakeTimers();
  F.requestFocus({ kind: "position", symbol: "BTCUSDT" });
  const a = F.getFocusRequest();
  expect(a).toMatchObject({ kind: "position", symbol: "BTCUSDT", strength: "strong" });
  F.consumeFocus({ at: a.at - 1 }); // stale request: ignored
  expect(F.getFocusRequest()).not.toBeNull();
  F.consumeFocus(a);
  expect(F.getFocusRequest()).toBeNull();
  F.requestFocus({ kind: "order", symbol: "XRPUSDT", orderId: 5, strength: "light" });
  expect(F.getFocusRequest().orderId).toBe("5");
  jest.advanceTimersByTime(21000);
  expect(F.getFocusRequest()).toBeNull();
  jest.useRealTimers();
});

test("banner copy: neutral, rounded down, fallback 500+", () => {
  expect(F.perpsBannerSubtitle(null)).toBe("500+ markets · Long or short with leverage");
  expect(F.marketCountLabel(0)).toBe("500+");
  expect(F.marketCountLabel(37)).toBe("37");
  expect(F.marketCountLabel(163)).toBe("150+");
  expect(F.marketCountLabel(499)).toBe("450+");
  expect(F.marketCountLabel(512)).toBe("500+");
  expect(F.marketCountLabel(1288)).toBe("1200+");
  expect(F.perpsBannerSubtitle(163)).not.toMatch(/\d+x/);
});
