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
    expect(S.mapFusionStatus("not-enough-balance-or-allowance")).toEqual({ stage: "failed", reason: "balance" });
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

describe("executeOrder (mocked backend/signer)", () => {
  const W = "0x6ad7a4c1f113f65af139831d7d78eaac6b9a4ea0";
  const asset = { id: "AAPLon-BSC", symbol: "AAPLon", chain: "BSC", address: "0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4", decimals: 18 };
  const usdc = { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 };
  const summary = { toAmount: "7000000000000000", minReceived: "6900000000000000", quoteId: "q", auctionSeconds: 180 };
  const typedData = { primaryType: "Order", domain: {}, message: { maker: W, makerAsset: usdc.address, takerAsset: asset.address, makingAmount: "2000000000000000000", takingAmount: "6900000000000000", salt: "1", makerTraits: "0" } };
  const params = (over = {}) => ({ wallet: W, asset, side: "buy", payToken: usdc, amountUnits: "2000000000000000000", amountText: "2", quote: {}, summary, quotedAt: Date.now(), groupKey: "ondo|AAPLon", ...over });

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

  test("guard failure: nothing signed, record failed", async () => {
    api.proxyRequest.mockResolvedValueOnce({ res: { typedData, orderHash: "0xh", extension: "0x" } });
    assertFusionOrder.mockImplementationOnce(() => {
      throw new Error("order pays someone else");
    });
    const r = await executeOrder(params({ wallet: "0x1111111111111111111111111111111111111111" }));
    expect(r.stage).toBe("failed");
    expect(r.error).toMatch(/Nothing was signed/);
    expect(NativeModules.TransactionSigner.signTypedData).not.toHaveBeenCalled();
  });

  test("happy path: build -> guard -> sign -> exact approve -> submit; stored by order hash; second order blocked", async () => {
    api.proxyRequest
      .mockResolvedValueOnce({ res: { typedData, orderHash: "0xorder", extension: "0xext" } })
      .mockResolvedValueOnce({ res: { ok: true } });
    NativeModules.TransactionSigner.signTypedData.mockResolvedValueOnce({ signature: "0xsig" });
    ensureFusionAllowance.mockResolvedValueOnce({ status: true, txHash: "0xapprove" });
    const stages = [];
    const r = await executeOrder(params(), (rec) => stages.push(rec.stage));
    expect(r).toMatchObject({ id: "0xorder", orderHash: "0xorder", stage: "submitted", approveTx: "0xapprove" });
    expect(stages).toEqual(["preparing", "signing", "approving", "submitting", "submitted"]);
    // exact amount approval, on the asset's chain
    expect(ensureFusionAllowance).toHaveBeenCalledWith(usdc.address, W, "2000000000000000000", "BNB", 56);
    // receiver = own wallet; signature passed through, never stored
    const submitBody = api.proxyRequest.mock.calls[1][2];
    expect(submitBody.order.receiver).toBe(W);
    const saved = await store.loadOrders(W);
    expect(JSON.stringify(saved)).not.toMatch(/0xsig/);
    // duplicate: an open order blocks a new one
    const again = await executeOrder(params());
    expect(again.code).toBe("duplicate");
  });

  test("signing cancelled: nothing sent", async () => {
    api.proxyRequest.mockResolvedValueOnce({ res: { typedData, orderHash: "0xh2", extension: "0x" } });
    NativeModules.TransactionSigner.signTypedData.mockResolvedValueOnce({});
    const r = await executeOrder(params());
    expect(r.stage).toBe("failed");
    expect(ensureFusionAllowance).not.toHaveBeenCalled();
  });
});
