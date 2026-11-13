// Perps money math: decimal helpers, input cleaning, order building (long/short), PnL, fees.
// Pure functions only (no network). Run: npx jest src/perps
import {
  toPlain,
  toUnits,
  fromUnits,
  isValid,
  isPositive,
  floorToStep,
  ceilToStep,
  roundToStep,
  toTokenUnits,
  fromTokenUnits,
  sub,
  mul,
  div,
  gt,
  lte,
  decimalsOf,
  cleanAmountInput,
} from "../utils/decimal";
import { buildEntryOrder, buildTpSlOrders, buildCloseOrder, unrealizedPnl, estimateFee } from "../utils/orderMath";
import { formatAmount, formatNumber } from "../utils/format";

describe("decimal", () => {
  test("toPlain normalises inputs and rejects junk", () => {
    expect(toPlain("1e-7")).toBe("0.00000010000000000000");
    expect(toPlain(".5")).toBe("0.5");
    expect(toPlain("-.5")).toBe("-0.5");
    expect(toPlain("1,234.5")).toBe("1234.5");
    expect(toPlain("abc")).toBeNull();
    expect(toPlain("1.2.3")).toBeNull();
    expect(toPlain("")).toBeNull();
    expect(toPlain(".")).toBeNull();
    expect(toPlain(Infinity)).toBeNull();
    expect(toPlain("1e25")).toBeNull(); // huge exponent -> rejected, not mis-parsed
  });

  test("toUnits truncates past 18 decimals (never rounds up)", () => {
    expect(fromUnits(toUnits("0.1234567890123456789999"))).toBe("0.123456789012345678");
    expect(fromUnits(toUnits("0.000000000000000001"))).toBe("0.000000000000000001");
    expect(fromUnits(toUnits("0.0000000000000000009"))).toBe("0");
    expect(isValid("99999999999999999999")).toBe(true);
    expect(isPositive("0")).toBe(false);
    expect(isPositive("0.")).toBe(false);
    expect(isPositive("1e-18")).toBe(true);
  });

  test("exact arithmetic (no float drift)", () => {
    expect(sub("0.3", "0.1")).toBe("0.2");
    expect(mul("0.1", "3")).toBe("0.3");
    expect(div("1", "3")).toBe("0.333333333333333333");
    expect(sub("2", "0.11")).toBe("1.89");
  });

  test("step rounding directions", () => {
    expect(floorToStep("1.239", "0.01")).toBe("1.23");
    expect(ceilToStep("1.231", "0.01")).toBe("1.24");
    expect(ceilToStep("1.23", "0.01")).toBe("1.23");
    expect(roundToStep("1.235", "0.01")).toBe("1.24");
    expect(roundToStep("1.2349", "0.01")).toBe("1.23");
    expect(floorToStep("0.0009", "0.001")).toBe("0.000");
    expect(decimalsOf("0.0010")).toBe(3);
    expect(() => floorToStep("1", "0")).toThrow();
  });

  test("token units: 6 and 18 decimals, both ways, truncating", () => {
    expect(toTokenUnits("1.1234567", 6).toString()).toBe("1123456");
    expect(toTokenUnits("6.78", 18).toString()).toBe("6780000000000000000");
    expect(fromTokenUnits(toTokenUnits("0.000001", 6), 6)).toBe("0.000001");
    expect(fromTokenUnits(toTokenUnits("123.45", 18), 18)).toBe("123.45");
    expect(fromTokenUnits(toTokenUnits("0.0000001", 6), 6)).toBe("0");
    // Max never exceeds balance: floor to 6 decimals of an 18-decimal balance.
    const bal = fromTokenUnits(toTokenUnits("6.789999999999999999", 18), 18);
    expect(lte(floorToStep(bal, "0.000001"), bal)).toBe(true);
  });
});

describe("cleanAmountInput (typed / pasted amounts)", () => {
  const cases = [
    ["12,5", "12.5"],
    ["1,234.56", "1234.56"],
    ["1.234,56", "1234.56"],
    ["1,234,567", "1234567"],
    ["1.234.567", "1234567"],
    ["1.2.3", "1.23"],
    ["1.2.", "1.2"],
    ["0.", "0."],
    [".5", ".5"],
    ["-3", "3"],
    ["abc", ""],
    [" 7 ", "7"],
    ["$1,000.00 USDT", "1000.00"],
    ["0.123456789012", "0.12345678"],
    ["0000.5", "0000.5"],
  ];
  test.each(cases)("%s -> %s", (input, out) => {
    expect(cleanAmountInput(input)).toBe(out);
  });
  test("custom decimals cap", () => {
    expect(cleanAmountInput("1.1234567", 6)).toBe("1.123456");
  });
});

const META = {
  tickSize: "0.1",
  stepSize: "0.001",
  marketStepSize: "0.001",
  minQty: "0.001",
  minNotional: "5",
  maxQty: "1000",
  marketMaxQty: "120",
  priceBandDown: "0.98",
  priceBandUp: "1.02",
};

describe("orderMath", () => {
  test("market long: qty floored to step, margin used <= amount", () => {
    const r = buildEntryOrder({ symbol: "BTCUSDT", direction: "LONG", type: "MARKET", margin: "3.5", leverage: 20, markPrice: "69000", meta: META });
    expect(r.ok).toBe(true);
    expect(r.qty).toBe("0.001");
    expect(r.params.side).toBe("BUY");
    expect(lte(r.marginUsed, "3.5")).toBe(true);
    expect(r.notional).toBe("69");
  });

  test("market short side", () => {
    const r = buildEntryOrder({ symbol: "BTCUSDT", direction: "SHORT", type: "MARKET", margin: "10", leverage: 10, markPrice: "69000", meta: META });
    expect(r.ok).toBe(true);
    expect(r.params.side).toBe("SELL");
    expect(r.qty).toBe("0.001");
  });

  test("min qty / min notional / max qty", () => {
    expect(buildEntryOrder({ symbol: "BTCUSDT", direction: "LONG", type: "MARKET", margin: "1", leverage: 20, markPrice: "69000", meta: META }).ok).toBe(false);
    const big = buildEntryOrder({ symbol: "BTCUSDT", direction: "LONG", type: "MARKET", margin: "500000", leverage: 20, markPrice: "69000", meta: META });
    expect(big.ok).toBe(false);
    expect(big.error).toMatch(/at most 120/);
    const bigLimit = buildEntryOrder({ symbol: "BTCUSDT", direction: "LONG", type: "LIMIT", margin: "500000", leverage: 20, markPrice: "69000", limitPrice: "69000", meta: META });
    expect(bigLimit.ok).toBe(true); // 144.9 BTC < LOT_SIZE maxQty 1000
    expect(buildEntryOrder({ symbol: "BTCUSDT", direction: "LONG", type: "MARKET", margin: "0", leverage: 20, markPrice: "69000", meta: META }).ok).toBe(false);
    expect(buildEntryOrder({ symbol: "BTCUSDT", direction: "LONG", type: "MARKET", margin: "5", leverage: 0, markPrice: "69000", meta: META }).ok).toBe(false);
  });

  test("limit price rounded to tick and inside the PERCENT_PRICE band", () => {
    const ok = buildEntryOrder({ symbol: "BTCUSDT", direction: "LONG", type: "LIMIT", margin: "10", leverage: 10, markPrice: "69000", limitPrice: "68999.96", meta: META });
    expect(ok.ok).toBe(true);
    expect(ok.price).toBe("69000.0");
    const out = buildEntryOrder({ symbol: "BTCUSDT", direction: "LONG", type: "LIMIT", margin: "10", leverage: 10, markPrice: "69000", limitPrice: "60000", meta: META });
    expect(out.ok).toBe(false);
  });

  test("TP/SL sides for long and short", () => {
    const long = buildTpSlOrders({ symbol: "BTCUSDT", direction: "LONG", entryPrice: "69000", tp: "70000", sl: "68000", tickSize: "0.1" });
    expect(long.ok).toBe(true);
    expect(long.orders.map((o) => [o.type, o.side])).toEqual([["TAKE_PROFIT_MARKET", "SELL"], ["STOP_MARKET", "SELL"]]);
    const badLong = buildTpSlOrders({ symbol: "BTCUSDT", direction: "LONG", entryPrice: "69000", tp: "68000", sl: "70000", tickSize: "0.1" });
    expect(badLong.ok).toBe(false);
    expect(badLong.errors).toHaveLength(2);
    const short = buildTpSlOrders({ symbol: "BTCUSDT", direction: "SHORT", entryPrice: "69000", tp: "68000", sl: "70000", tickSize: "0.1" });
    expect(short.ok).toBe(true);
    expect(short.orders.every((o) => o.side === "BUY" && o.closePosition === "true")).toBe(true);
  });

  test("close order: reduce-only, exact size, both sides", () => {
    expect(buildCloseOrder({ symbol: "BTCUSDT", positionAmt: "0.001" })).toMatchObject({ side: "SELL", quantity: "0.001", reduceOnly: "true" });
    expect(buildCloseOrder({ symbol: "BTCUSDT", positionAmt: "-0.002" })).toMatchObject({ side: "BUY", quantity: "0.002" });
    expect(buildCloseOrder({ symbol: "BTCUSDT", positionAmt: "0" })).toBeNull();
  });

  test("PnL / ROE for long and short (matches the live BTC close: +0.5714)", () => {
    const live = unrealizedPnl({ positionAmt: "0.001", entryPrice: "68782.3", markPrice: "69353.7", margin: "3.439115" });
    expect(live.pnl).toBe("0.5714");
    expect(Number(live.pct)).toBeCloseTo(16.6147, 3);
    const short = unrealizedPnl({ positionAmt: "-0.001", entryPrice: "69353.7", markPrice: "68782.3", margin: "3.5" });
    expect(short.pnl).toBe("0.5714");
    expect(unrealizedPnl({ positionAmt: "x", entryPrice: "1", markPrice: "1" }).pnl).toBeNull();
  });

  test("fee estimate (taker 0.04%) vs the live fills", () => {
    // Live: open 68.7823 notional paid 0.02751292; close 69.3537 paid 0.02774148.
    expect(estimateFee("68.7823")).toBe("0.02751292");
    expect(estimateFee("69.3537")).toBe("0.02774148");
    expect(estimateFee("0")).toBe("0");
  });
});

describe("format", () => {
  test("display helpers never throw on junk", () => {
    expect(formatNumber("abc")).toBe("—");
    expect(formatAmount("1.000000")).toBe("1");
    expect(formatAmount("0.00123000", 6)).toBe("0.00123");
    expect(formatNumber("-1234.5", 2)).toBe("-1,234.50");
  });
});
