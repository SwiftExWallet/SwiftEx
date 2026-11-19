// RWA orders vs the shared swap guard (src/utilities/swapGuard.js + fusionCheck.js, e4be953).
// Uses the REAL shared guard (not mocked) on a real captured BNB Chain order: the RWA executor's
// own check and the shared check must both accept it (no double-block), and the shared check
// must still refuse a tampered order (nothing weakened).
const { assertFusionOrder } = require("../../utilities/swapGuard");
const { isFusionSettlement } = require("../../utilities/fusionCheck");
const { verifyRwaFusionOrder } = require("../orders/fusionCheck");
const fx = require("./fixtures/fusionOrderBsc.json");

const clone = (o) => JSON.parse(JSON.stringify(o));
const opts = (over = {}) => ({
  wallet: fx.wallet,
  fromToken: { address: fx.tokenIn },
  toToken: { address: fx.tokenOut },
  amountWei: fx.amountUnits,
  chainId: 56,
  crossChain: false,
  minTakingAmount: fx.minReceived,
  ...over,
});
const rwaCheck = (td) =>
  verifyRwaFusionOrder(td, { wallet: fx.wallet, chainId: 56, extension: fx.extension, orderHash: fx.orderHash, minTakingAmount: fx.minReceived, now: fx.capturedAtMs });

test("the captured order pays 1inch's settlement contract (fee-bearing order)", () => {
  expect(isFusionSettlement(fx.typedData.message.receiver, 56)).toBe(true);
});

test("as the RWA executor calls it (verified final receiver): RWA check + shared guard both pass", () => {
  const checked = rwaCheck(clone(fx.typedData));
  expect(checked.receiverRule).toBe("settlement");
  const td = clone(fx.typedData);
  const forShared = { ...td, message: { ...td.message, receiver: checked.finalReceiver } };
  expect(() => assertFusionOrder(forShared, opts())).not.toThrow();
});

test("real order + extension: Hunny's shared fee-order check also accepts RWA orders", () => {
  expect(() => assertFusionOrder(clone(fx.typedData), opts({ extension: fx.extension }))).not.toThrow();
});

test("shared guard still refuses: missing extension, lower minimum shown, different token", () => {
  expect(() => assertFusionOrder(clone(fx.typedData), opts())).toThrow(/extension/);
  const higherMin = (BigInt(fx.minReceived) + 1n).toString();
  expect(() => assertFusionOrder(clone(fx.typedData), opts({ extension: fx.extension, minTakingAmount: higherMin }))).toThrow(/minimum/);
  expect(() => assertFusionOrder(clone(fx.typedData), opts({ extension: fx.extension, toToken: { address: fx.tokenIn } }))).toThrow(/different token/);
});

test("shared list covers BNB Chain only (RWA's own list also has Ethereum) — why the executor keeps passing the verified receiver", () => {
  expect(isFusionSettlement(fx.typedData.message.receiver, 1)).toBe(false);
});
