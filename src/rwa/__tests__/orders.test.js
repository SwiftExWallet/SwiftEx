// Order tracking state machine + duplicate guards + executor safety checks (no network, no signing).
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = {};
  return {
    __esModule: true,
    default: {
      __clear: () => Object.keys(store).forEach((k) => delete store[k]),
      getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k, v) => {
        store[k] = v;
      }),
    },
  };
});
jest.mock("../../Dashboard/exchange/crypto-exchange-front-end-main/src/api", () => ({ PPOST: jest.fn(), PGET: jest.fn(), proxyRequest: jest.fn() }));
jest.mock("../../utilities/swapGuard", () => ({ assertFusionOrder: jest.fn() }));
jest.mock("../../utilities/FusionAllowance", () => ({ ensureFusionAllowance: jest.fn() }));
jest.mock("../../utilities/ShortTermStorage", () => ({ __esModule: true, default: { syncTx: jest.fn() } }));
jest.mock("../api/balances", () => ({ tokenBalance: jest.fn(async () => "0") }));
jest.mock("react-native", () => ({ NativeModules: { TransactionSigner: { signTypedData: jest.fn() } } }));

const S = require("../orders/orderState");
const store = require("../orders/orderStore");
const { executeOrder, __test } = require("../orders/executeOrder");
const api = require("../../Dashboard/exchange/crypto-exchange-front-end-main/src/api");
const { NativeModules } = require("react-native");
const { assertFusionOrder } = require("../../utilities/swapGuard");
const { ensureFusionAllowance } = require("../../utilities/FusionAllowance");

const base = { id: "0xabc", orderHash: "0xabc", stage: "submitted", createdAt: 1000, expiresAt: 1000 + 8 * 60000, outBalanceBefore: "100", minOut: "1000" };

describe("state machine", () => {
  test("1inch statuses map to stages", () => {
    expect(S.mapFusionStatus("pending").stage).toBe("filling");
    expect(S.mapFusionStatus("filled").stage).toBe("filled");
    expect(S.mapFusionStatus("expired").stage).toBe("expired");
    expect(S.mapFusionStatus("cancelled").stage).toBe("cancelled");
    expect(S.mapFusionStatus("not-enough-balance-or-allowance")).toEqual({ stage: null, reason: "balance" });
    expect(S.mapFusionStatus("weird")).toBeNull();
  });
  test("status response read defensively (data.status / fills)", () => {
    expect(S.readStatusResponse({ data: { status: "filled", fills: [{ txHash: "0xf" }] } })).toEqual({ status: "filled", fillTx: "0xf" });
    expect(S.readStatusResponse({ status: "pending" })).toEqual({ status: "pending", fillTx: null });
    expect(S.readStatusResponse(null)).toEqual({ status: null, fillTx: null });
  });
  test("filled by backend status; final states never change", () => {
    const f = S.applyUpdate(base, { status: "filled", fillTx: "0xfill", now: 2000 });
    expect(f).toMatchObject({ stage: "filled", fillTx: "0xfill", doneAt: 2000 });
    expect(S.applyUpdate(f, { status: "expired", now: 3000 })).toBe(f);
  });
  test("filled by balance when the status call fails (>= 95% of the minimum arrived)", () => {
    expect(S.applyUpdate(base, { status: null, outBalance: "1051", now: 2000 }).stage).toBe("filled");
    expect(S.applyUpdate(base, { status: null, outBalance: "1000", now: 2000 }).stage).toBe("submitted"); // only +900
  });
  test("live bug: status 'not-enough-balance-or-allowance' right after a fill (allowance used up) -> filled by balance, not failed", () => {
    const r = S.applyUpdate(base, { status: "not-enough-balance-or-allowance", outBalance: "1100", now: 2000 });
    expect(r).toMatchObject({ stage: "filled", filledBy: "balance" });
    // without the tokens arriving it is not final (approval may still be mining); expiry decides
    const w = S.applyUpdate(base, { status: "not-enough-balance-or-allowance", outBalance: "100", now: 2000 });
    expect(w.stage).toBe("submitted");
    expect(S.applyUpdate(w, { status: "not-enough-balance-or-allowance", outBalance: "100", now: base.expiresAt + 1 }).stage).toBe("expired");
    // a lagging 'expired' status loses to tokens that actually arrived
    expect(S.applyUpdate(base, { status: "expired", outBalance: "1100", now: 2000 }).stage).toBe("filled");
  });
  test("expires after the auction + margin; funds stay", () => {
    const e = S.applyUpdate(base, { status: "pending", now: base.expiresAt + 1 });
    expect(e.stage).toBe("expired");
    expect(S.STAGE_TEXT.expired).toMatch(/funds stay in your wallet/);
  });
  test("expiry = auction seconds + 5 min (default auction 3 min)", () => {
    expect(S.expiryFor(0, 120)).toBe(120000 + 300000);
    expect(S.expiryFor(0, null)).toBe(180000 + 300000);
  });
  test("duplicate guard: open order or a start in the last 15 s blocks", () => {
    expect(S.canStartOrder([], 5000).ok).toBe(true);
    expect(S.canStartOrder([base], 5000)).toMatchObject({ ok: false, reason: "open" });
    expect(S.canStartOrder([{ ...base, stage: "filled", createdAt: 0 }], 60000).ok).toBe(true);
    expect(S.canStartOrder([{ ...base, stage: "failed", createdAt: 50000 }], 60000)).toMatchObject({ ok: false, reason: "recent" });
    expect(S.canStartOrder([{ ...base, expiresAt: 10 }], 60000).ok).toBe(true); // past expiry: not blocking
  });
  test("quote freshness", () => {
    expect(S.quoteIsFresh(1000, 1000 + 45000)).toBe(true);
    expect(S.quoteIsFresh(1000, 1000 + 45001)).toBe(false);
    expect(S.quoteIsFresh(0, 1)).toBe(false);
  });
});


describe("executeOrder (mocked backend/signer, real captured BNB order)", () => {
  const fx = require("./fixtures/fusionOrderBsc.json");
  const W = fx.wallet;
  const SETTLEMENT = "0x2ad5004c60e16e54d5007c80ce329adde5b51ef5";
  const asset = { id: "AAPLx-BSC", symbol: "AAPLx", chain: "BSC", address: fx.tokenOut, decimals: 18 };
  const usdt = { symbol: "USDT", address: fx.tokenIn, decimals: 18 };
  const summary = { toAmount: "55868000000000000", minReceived: fx.minReceived, quoteId: "q", auctionSeconds: 180 };
  const built = (over = {}) => ({ res: { typedData: JSON.parse(JSON.stringify(fx.typedData)), orderHash: fx.orderHash, extension: fx.extension, ...over } });
  const params = (over = {}) => ({ wallet: W, asset, side: "buy", payToken: usdt, amountUnits: fx.amountUnits, amountText: "20", quote: {}, summary, quotedAt: Date.now(), groupKey: "xstocks|AAPLx", ...over });

  beforeEach(() => {
    require("@react-native-async-storage/async-storage").default.__clear();
    store.__test.reset();
    __test.reset();
    jest.clearAllMocks();
  });

  test("stale quote is refused before anything happens", async () => {
    const r = await executeOrder(params({ quotedAt: Date.now() - 60000 }));
    expect(r.code).toBe("quote-expired");
    expect(api.proxyRequest).not.toHaveBeenCalled();
  });

  test("shared guard failure: nothing signed, record failed", async () => {
    api.proxyRequest.mockResolvedValueOnce(built());
    assertFusionOrder.mockImplementationOnce(() => {
      throw new Error("order sells a different token");
    });
    const r = await executeOrder(params());
    expect(r.stage).toBe("failed");
    expect(r.error).toMatch(/nothing was signed/i);
    expect(r).not.toHaveProperty("guardInfo"); // no order details kept on the record
    expect(NativeModules.TransactionSigner.signTypedData).not.toHaveBeenCalled();
  });

  test("RWA check failure (backend hash doesn't match the order): shared guard not even reached, nothing signed", async () => {
    api.proxyRequest.mockResolvedValueOnce(built({ orderHash: "0x" + "22".repeat(32) }));
    const r = await executeOrder(params());
    expect(r.stage).toBe("failed");
    expect(assertFusionOrder).not.toHaveBeenCalled();
    expect(NativeModules.TransactionSigner.signTypedData).not.toHaveBeenCalled();
  });

  test("minimum shown higher than the order pays: refused", async () => {
    api.proxyRequest.mockResolvedValueOnce(built());
    const r = await executeOrder(params({ summary: { ...summary, minReceived: (BigInt(fx.minReceived) + 1n).toString() } }));
    expect(r.stage).toBe("failed");
    expect(NativeModules.TransactionSigner.signTypedData).not.toHaveBeenCalled();
  });

  test("happy path: verify -> shared guard -> sign -> exact approve -> submit with the SIGNED receiver; second order blocked", async () => {
    api.proxyRequest.mockResolvedValueOnce(built()).mockResolvedValueOnce({ res: { ok: true } });
    NativeModules.TransactionSigner.signTypedData.mockResolvedValueOnce({ signature: "0xsig" });
    ensureFusionAllowance.mockResolvedValueOnce({ status: true, txHash: "0xapprove" });
    const stages = [];
    const r = await executeOrder(params(), (rec) => stages.push(rec.stage));
    expect(r).toMatchObject({ id: fx.orderHash, orderHash: fx.orderHash, stage: "submitted", approveTx: "0xapprove" });
    expect(stages).toEqual(["preparing", "signing", "approving", "submitting", "submitted"]);
    // shared guard ran with every other check; its receiver rule sees the verified final receiver (wallet)
    expect(assertFusionOrder).toHaveBeenCalledTimes(1);
    const [guardTd, guardOpts] = assertFusionOrder.mock.calls[0];
    expect(guardTd.message.receiver).toBe(W);
    expect(guardOpts).toMatchObject({ wallet: W, chainId: 56, crossChain: false, minTakingAmount: fx.minReceived });
    // the order that is signed is the backend's original (receiver = settlement contract)
    const signedJson = JSON.parse(NativeModules.TransactionSigner.signTypedData.mock.calls[0][2]);
    expect(signedJson.message.receiver).toBe(SETTLEMENT);
    // exact amount approval, on the asset's chain
    expect(ensureFusionAllowance).toHaveBeenCalledWith(usdt.address, W, fx.amountUnits, "BNB", 56);
    // submitted order = signed order (same receiver), so the hash/signature stay valid
    const submitBody = api.proxyRequest.mock.calls[1][2];
    expect(submitBody.order.receiver).toBe(SETTLEMENT);
    expect(submitBody.extension).toBe(fx.extension);
    const saved = await store.loadOrders(W);
    expect(JSON.stringify(saved)).not.toMatch(/0xsig/);
    const again = await executeOrder(params());
    expect(again.code).toBe("duplicate");
  });

  test("signing cancelled: nothing sent", async () => {
    api.proxyRequest.mockResolvedValueOnce(built());
    NativeModules.TransactionSigner.signTypedData.mockResolvedValueOnce({});
    const r = await executeOrder(params());
    expect(r.stage).toBe("failed");
    expect(ensureFusionAllowance).not.toHaveBeenCalled();
  });
});
