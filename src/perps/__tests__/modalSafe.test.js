// iOS freeze guard: no info dialog may be presented while a perps modal is open or dismissing.
jest.mock("../../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider", () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const CustomInfoProvider = require("../../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider").default;
const { showInfo, __test } = require("../utils/modalSafe");
const { buildEntryOrder } = require("../utils/orderMath");

beforeEach(() => {
  jest.useFakeTimers();
  CustomInfoProvider.show.mockClear();
  __test.reset();
});
afterEach(() => jest.useRealTimers());

test("shown immediately when no perps modal is open", () => {
  showInfo("success", "Order placed", "ok");
  expect(CustomInfoProvider.show).toHaveBeenCalledTimes(1);
});

test("queued while the confirm sheet is open, shown after it has hidden", () => {
  __test.markOpen("confirm");
  showInfo("error", "Order not placed", "x");
  jest.advanceTimersByTime(2000);
  expect(CustomInfoProvider.show).not.toHaveBeenCalled(); // would freeze iOS
  __test.markHidden("confirm");
  jest.advanceTimersByTime(10);
  expect(CustomInfoProvider.show).toHaveBeenCalledTimes(1);
  expect(CustomInfoProvider.show.mock.calls[0][1]).toBe("Order not placed");
});

test("waits for ALL open modals (sheet over screen + History)", () => {
  __test.markOpen("a");
  __test.markOpen("b");
  showInfo("info", "T", "m");
  __test.markHidden("a");
  jest.advanceTimersByTime(10);
  expect(CustomInfoProvider.show).not.toHaveBeenCalled();
  __test.markHidden("b");
  jest.advanceTimersByTime(10);
  expect(CustomInfoProvider.show).toHaveBeenCalledTimes(1);
});

test("only the latest queued message is shown", () => {
  __test.markOpen("s");
  showInfo("info", "first", "1");
  showInfo("info", "second", "2");
  __test.markHidden("s");
  jest.advanceTimersByTime(10);
  expect(CustomInfoProvider.show).toHaveBeenCalledTimes(1);
  expect(CustomInfoProvider.show.mock.calls[0][1]).toBe("second");
});

test("a dialog button runs its action only after the dialog faded out", () => {
  const action = jest.fn();
  showInfo("info", "Close position?", "m", [{ text: "Close", onPress: action }]);
  const buttons = CustomInfoProvider.show.mock.calls[0][3];
  buttons[0].onPress();
  expect(action).not.toHaveBeenCalled();
  // a follow-up dialog during the fade is held back too
  showInfo("success", "Done", "ok");
  expect(CustomInfoProvider.show).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(500);
  expect(action).toHaveBeenCalledTimes(1);
  expect(CustomInfoProvider.show).toHaveBeenCalledTimes(2);
});

// The pre-submit rules check rebuilds the order with the fresh rules: format / cache-shape
// differences (numbers vs strings, missing new fields) must NOT count as "rules changed".
test("rule refresh: same order from cached vs fresh rule formats", () => {
  const input = { symbol: "XRPUSDT", direction: "LONG", type: "MARKET", margin: "2", leverage: 5, markPrice: "1.03" };
  const cached = { tickSize: 0.0001, stepSize: 0.1, marketStepSize: 0.1, minQty: 0.1, minNotional: 5 }; // numbers, no maxQty
  const fresh = { tickSize: "0.0001", stepSize: "0.1", marketStepSize: "0.1", minQty: "0.1", minNotional: "5", maxQty: "1000000", marketMaxQty: "2000000" };
  const a = buildEntryOrder({ ...input, meta: cached });
  const b = buildEntryOrder({ ...input, meta: { ...cached, ...fresh } });
  expect(a.ok && b.ok).toBe(true);
  expect(b.qty).toBe(a.qty);
  expect(b.price).toBe(a.price);
  // a REAL rule change (bigger step) does change the order
  const c = buildEntryOrder({ ...input, meta: { ...fresh, stepSize: "1", marketStepSize: "1" } });
  expect(c.qty).not.toBe(a.qty);
});
