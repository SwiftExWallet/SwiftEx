// Order success sheet: its content, and that it opens only once the confirm sheet has hidden.
jest.mock("../../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider", () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const CustomInfoProvider = require("../../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider").default;
const { whenModalsClear, showInfo, __test } = require("../utils/modalSafe");
const { orderResultContent } = require("../utils/positionFocus");

const BTC_LONG = {
  symbol: "BTCUSDT",
  positionAmt: "0.001",
  entryPrice: "68800",
  liquidationPrice: "65400",
  leverage: "20",
};
const base = { direction: "LONG", qty: "0.001", price: "68800", baseAsset: "BTC", tickSize: "0.1", leverage: 20 };

test("filled order: title, position rows, View position", () => {
  const c = orderResultContent({ ...base, isOrder: false, pos: BTC_LONG });
  expect(c.title).toBe("Long opened");
  expect(c.viewText).toBe("View position");
  expect(c.rows).toEqual([
    { label: "Position", value: "BTC Long 20x" },
    { label: "Entry price", value: "$68,800.0" },
    { label: "Size", value: "0.001 BTC" },
    { label: "Liq. price", value: "$65,400.0" },
  ]);
  expect(c.warn).toBe(false);
  expect(c.note).toBeNull();
});

test("short read back without liq. price; position not readable falls back to the sent order", () => {
  const s = orderResultContent({ ...base, direction: "SHORT", isOrder: false, pos: { ...BTC_LONG, positionAmt: "-0.002", liquidationPrice: "0" } });
  expect(s.title).toBe("Short opened");
  expect(s.rows.map((r) => r.label)).toEqual(["Position", "Entry price", "Size"]);
  expect(s.rows[2].value).toBe("0.002 BTC");
  const f = orderResultContent({ ...base, isOrder: false, pos: null });
  expect(f.title).toBe("Long opened");
  expect(f.rows).toContainEqual({ label: "Price", value: "Filled at market" });
});

test("resting limit order: Limit order placed, View order", () => {
  const c = orderResultContent({ ...base, direction: "SHORT", isOrder: true, pos: null, price: "70000" });
  expect(c.title).toBe("Limit order placed");
  expect(c.viewText).toBe("View order");
  expect(c.rows).toContainEqual({ label: "Order", value: "Limit sell · Short" });
  expect(c.rows).toContainEqual({ label: "Limit price", value: "$70,000.0" });
  expect(c.rows).toContainEqual({ label: "Status", value: "Waiting in Open orders" });
});

test("TP/SL partly failed: warning note listing what failed", () => {
  const c = orderResultContent({ ...base, isOrder: false, pos: BTC_LONG, failed: [{ type: "STOP_MARKET", text: "Price too close" }] });
  expect(c.warn).toBe(true);
  expect(c.note).toMatch(/TP\/SL not set/);
  expect(c.note).toMatch(/Stop loss: Price too close/);
  const tp = orderResultContent({ ...base, isOrder: false, pos: BTC_LONG, failed: [{ type: "TAKE_PROFIT_MARKET", text: "x" }] });
  expect(tp.note).toMatch(/Take profit: x/);
  expect(c.note).toMatch(/Set TP\/SL again/);
});

describe("whenModalsClear", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    CustomInfoProvider.show.mockClear();
    __test.reset();
  });
  afterEach(() => jest.useRealTimers());

  test("runs at once when nothing is open", () => {
    const run = jest.fn();
    whenModalsClear(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(CustomInfoProvider.show).not.toHaveBeenCalled();
  });

  test("waits for the confirm sheet to hide (iOS: one modal at a time)", () => {
    const run = jest.fn();
    __test.markOpen("confirm");
    whenModalsClear(run);
    jest.advanceTimersByTime(2000);
    expect(run).not.toHaveBeenCalled();
    __test.markHidden("confirm");
    jest.advanceTimersByTime(10);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("latest wins: a later info dialog replaces a queued sheet", () => {
    const run = jest.fn();
    __test.markOpen("confirm");
    whenModalsClear(run);
    showInfo("error", "Later", "x");
    __test.markHidden("confirm");
    jest.advanceTimersByTime(10);
    expect(run).not.toHaveBeenCalled();
    expect(CustomInfoProvider.show).toHaveBeenCalledTimes(1);
  });
});
