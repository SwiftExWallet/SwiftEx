// Double-deposit safety: a deposit that may have gone out is never marked "failed", and no new
// deposit starts while one is unresolved or the wallet has an unconfirmed tx on that chain.
// Everything external is mocked; nothing is signed or sent.

const mockStore = {};
const mockNonce = { latest: 5, pending: 5, fail: false };
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k) => Promise.resolve(k in mockStore ? mockStore[k] : null)),
    setItem: jest.fn((k, v) => {
      mockStore[k] = v;
      return Promise.resolve();
    }),
    removeItem: jest.fn((k) => {
      delete mockStore[k];
      return Promise.resolve();
    }),
  },
}));
jest.mock("../api/asterFunds", () => ({
  executeChainDeposit: jest.fn(),
  prepareChainDeposit: jest.fn(),
  getLatestNonce: jest.fn(() => (mockNonce.fail ? Promise.reject(new Error("rpc")) : Promise.resolve(mockNonce.latest))),
  getPendingNonce: jest.fn(() => (mockNonce.fail ? Promise.reject(new Error("rpc")) : Promise.resolve(mockNonce.pending))),
}));
jest.mock("../api/asterHistory", () => ({ fetchTransferHistory: jest.fn() }));
jest.mock("../api/asterAssets", () => {
  const chains = [
    { chainId: 56, key: "BNB", name: "BNB Chain", native: "BNB", explorer: "https://bscscan.com", explorerName: "BscScan" },
    { chainId: 1, key: "ETH", name: "Ethereum", native: "ETH", explorer: "https://etherscan.io", explorerName: "Etherscan" },
  ];
  return { chainById: (id) => chains.find((c) => c.chainId === Number(id)) || chains[0] };
});

const USER = "0x00000000000000000000000000000000000000aa";
const PLAN = { chainId: 56, chainKey: "BNB", asset: "BNB", decimals: 18, isNative: true, amount: "0.01", needsApprove: false };
const KEY = "perps_deposit_pending";
const MIN = 60 * 1000;

let T; // depositTracker module, fresh per test
let funds;
let history;
const advance = (ms) => jest.advanceTimersByTimeAsync(ms);

// executeChainDeposit mock: reaches the deposit step, optionally changes the nonces, then returns res.
const sendReturns = (res, { pendingAfter, latestAfter, approveOnly } = {}) =>
  funds.executeChainDeposit.mockImplementationOnce(async (user, plan, onStep) => {
    if (!approveOnly) await onStep("depositing");
    if (pendingAfter !== undefined) mockNonce.pending = pendingAfter;
    if (latestAfter !== undefined) mockNonce.latest = latestAfter;
    return res;
  });
const TIMEOUT = { ok: false, step: "deposit", error: "Tx confirmation timeout after 90000ms" };

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  Object.assign(mockNonce, { latest: 5, pending: 5, fail: false });
  T = require("../storage/depositTracker");
  funds = require("../api/asterFunds");
  history = require("../api/asterHistory");
});
afterEach(() => jest.useRealTimers());

test("normal deposit still works (hash, confirmed, then credited via Aster history)", async () => {
  sendReturns({ ok: true, txHash: "0xabc" }, { pendingAfter: 6, latestAfter: 6 });
  const res = await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  expect(res).toEqual({ ok: true });
  const r = T.getDepositRecord();
  expect(r.depositHash).toBe("0xabc");
  expect(r.confirmedAt).toBeTruthy();
  expect(r.failed).toBeFalsy();
  history.fetchTransferHistory.mockResolvedValue({ data: [{ type: "DEPOSIT", txHash: "0xABC", state: "SUCCESS", asset: "BNB", amount: "0.01", time: Date.now() }] });
  const stop = T.watchCredit({}, USER);
  await advance(1500);
  stop();
  expect(T.getDepositRecord().creditedAt).toBeTruthy();
});

test("timeout without hash + pending nonce moved: 'sent, waiting for the network', never failed", async () => {
  sendReturns(TIMEOUT, { pendingAfter: 6 });
  await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  await advance(5000);
  let r = T.getDepositRecord();
  expect(r.failed).toBeFalsy();
  expect(r.sentAt).toBeTruthy();
  expect(r.unknownHash).toBe(true);
  expect(r.checking).toBe(false);
  expect(T.isDepositActive(r)).toBe(true);
  expect(JSON.parse(mockStore[KEY]).sentAt).toBeTruthy(); // kept for a relaunch
  mockNonce.latest = 6; // mined
  await advance(5000);
  r = T.getDepositRecord();
  expect(r.confirmedAt).toBeTruthy();
  expect(r.failed).toBeFalsy();
});

test("timeout, RPC doesn't see the tx for 5 minutes, then it's mined: never failed", async () => {
  sendReturns(TIMEOUT); // nonce stays 5 everywhere (broadcast through the backend proxy)
  await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  await advance(5 * MIN);
  let r = T.getDepositRecord();
  expect(r.failed).toBeFalsy();
  expect(r.broadcast).toBe(true);
  expect(T.isDepositActive(r)).toBe(true);
  mockNonce.latest = 6;
  mockNonce.pending = 6;
  await advance(20000);
  r = T.getDepositRecord();
  expect(r.confirmedAt).toBeTruthy();
  expect(r.failed).toBeFalsy();
});

test("broadcast error and the nonce never moves: failed only after the full window", async () => {
  sendReturns({ ok: false, step: "deposit", error: "Tx broadcast faild" });
  await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  await advance(2 * MIN);
  expect(T.getDepositRecord().failed).toBeFalsy(); // still checking
  expect(T.getDepositRecord().checking).toBe(true);
  await advance(2 * MIN);
  const r = T.getDepositRecord();
  expect(r.failed).toBeTruthy();
  expect(r.failed.text).toMatch(/couldn't be sent/);
  expect(mockStore[KEY]).toBeUndefined();
});

test("slow (>3 min) pending tx: not failed; after 15 min 'status unknown', record kept; then mined", async () => {
  sendReturns(TIMEOUT, { pendingAfter: 6 });
  await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  await advance(10 * MIN);
  expect(T.getDepositRecord().failed).toBeFalsy();
  expect(T.getDepositRecord().unknownStatus).toBeFalsy();
  await advance(6 * MIN);
  let r = T.getDepositRecord();
  expect(r.unknownStatus).toBe(true);
  expect(r.failed).toBeFalsy();
  expect(JSON.parse(mockStore[KEY]).unknownStatus).toBe(true);
  mockNonce.latest = 6;
  await advance(20000);
  r = T.getDepositRecord();
  expect(r.confirmedAt).toBeTruthy();
  expect(r.unknownStatus).toBe(false);
});

test("RPC down after a timeout: 'status unknown', never failed", async () => {
  sendReturns(TIMEOUT);
  await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  mockNonce.fail = true;
  await advance(20 * MIN);
  const r = T.getDepositRecord();
  expect(r.failed).toBeFalsy();
  expect(r.unknownStatus).toBe(true);
});

test("retry while the first deposit is pending is blocked (nothing sent)", async () => {
  sendReturns(TIMEOUT, { pendingAfter: 6 });
  await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  await advance(5000);
  const res = await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  expect(res.ok).toBe(false);
  expect(funds.executeChainDeposit).toHaveBeenCalledTimes(1);
  expect(await T.depositBlockReason(USER, { key: "BNB", chainId: 56 })).toBeTruthy();
});

test("unconfirmed wallet tx on that chain blocks a new deposit, with the shared wording", async () => {
  mockNonce.pending = 6; // e.g. an approval / earlier deposit still in the mempool, no record
  const res = await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  expect(res).toEqual({ ok: false, error: "A previous transaction is still confirming. Try again when it's done." });
  expect(funds.executeChainDeposit).not.toHaveBeenCalled();
  mockNonce.latest = 6;
  expect(await T.depositBlockReason(USER, { key: "BNB", chainId: 56 })).toBeNull();
});

test("can't read the nonces: blocked, nothing sent", async () => {
  mockNonce.fail = true;
  const res = await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  expect(res.ok).toBe(false);
  expect(funds.executeChainDeposit).not.toHaveBeenCalled();
});

test("double tap: the second start is refused while the first is being checked", async () => {
  sendReturns({ ok: true, txHash: "0xabc" });
  const a = T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  const b = await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  expect(b.ok).toBe(false);
  await a;
  expect(funds.executeChainDeposit).toHaveBeenCalledTimes(1);
});

test("relaunch while pending: still blocked and tracking resumes", async () => {
  const t = Date.now();
  mockStore[KEY] = JSON.stringify({
    user: USER, chainId: 56, chainKey: "BNB", asset: "BNB", isNative: true, amount: "0.01", needsApprove: false,
    startedAt: t - 30000, depositStartAt: t - 25000, nonceBeforeDeposit: 5, sentAt: null, confirmedAt: null,
    depositHash: null, broadcast: true, unknownHash: true, sendError: "Tx confirmation timeout", failed: null, interrupted: null,
  });
  mockNonce.pending = 6;
  await T.__test.load();
  await advance(10);
  expect(T.isDepositActive(T.getDepositRecord())).toBe(true);
  const res = await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  expect(res.ok).toBe(false);
  expect(funds.executeChainDeposit).not.toHaveBeenCalled();
  await advance(5000);
  expect(T.getDepositRecord().sentAt).toBeTruthy();
  mockNonce.latest = 6;
  await advance(5000);
  expect(T.getDepositRecord().confirmedAt).toBeTruthy();
  expect(T.getDepositRecord().failed).toBeFalsy();
});

test("relaunch, deposit step started but never sent: 'Continue deposit' only after the window", async () => {
  const t = Date.now();
  mockStore[KEY] = JSON.stringify({
    user: USER, chainId: 56, chainKey: "BNB", asset: "BNB", isNative: true, amount: "0.01", needsApprove: false,
    startedAt: t - 10000, depositStartAt: t - 10000, nonceBeforeDeposit: 5, sentAt: null, confirmedAt: null,
    depositHash: null, failed: null, interrupted: null,
  });
  await T.__test.load();
  await advance(MIN);
  expect(T.getDepositRecord().interrupted).toBeFalsy();
  expect(T.getDepositRecord().checking).toBe(true);
  await advance(3 * MIN);
  expect(T.getDepositRecord().interrupted).toBeTruthy();
  expect(T.getDepositRecord().failed).toBeFalsy();
});

test("sent, then the tx vanishes (nonce unused, not in mempool) for an hour: dropped -> failed", async () => {
  sendReturns(TIMEOUT, { pendingAfter: 6 });
  await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  await advance(5000);
  expect(T.getDepositRecord().sentAt).toBeTruthy();
  mockNonce.pending = 5;
  await advance(30 * MIN);
  expect(T.getDepositRecord().failed).toBeFalsy();
  await advance(31 * MIN);
  expect(T.getDepositRecord().failed.text).toMatch(/never confirmed/);
});

test("credit seen on Aster resolves a deposit with unknown hash", async () => {
  sendReturns(TIMEOUT); // no hash, RPC sees nothing yet
  await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  expect(T.mayBeCredited(T.getDepositRecord())).toBe(true);
  history.fetchTransferHistory.mockResolvedValue({ data: [{ type: "DEPOSIT", txHash: "0xfeed", state: "SUCCESS", asset: "BNB", amount: "0.01", time: Date.now() }] });
  const stop = T.watchCredit({}, USER);
  await advance(1500);
  stop();
  const r = T.getDepositRecord();
  expect(r.creditedAt).toBeTruthy();
  expect(r.depositHash).toBe("0xfeed");
  expect(r.confirmedAt).toBeTruthy();
});

test("approve times out: no deposit sent, retry blocked while the approval is pending", async () => {
  const p = { ...PLAN, asset: "USDT", isNative: false, needsApprove: true };
  sendReturns({ ok: false, step: "approve", error: "Tx confirmation timeout after 90000ms" }, { approveOnly: true, pendingAfter: 6 });
  await T.startDeposit({ user: USER, plan: p, baseline: null });
  const r = T.getDepositRecord();
  expect(r.failed.step).toBe("approve");
  expect(r.failed.text).toMatch(/approval was sent/);
  expect(r.sentAt).toBeFalsy();
  const res = await T.startDeposit({ user: USER, plan: p, baseline: null });
  expect(res.ok).toBe(false);
  expect(funds.executeChainDeposit).toHaveBeenCalledTimes(1);
});

test("cancel / revert / insufficient funds still fail right away (no tracking)", async () => {
  sendReturns({ ok: false, step: "deposit", error: "Transaction reverted on-chain", txHash: "0xdead" }, { latestAfter: 6, pendingAfter: 6 });
  await T.startDeposit({ user: USER, plan: PLAN, baseline: null });
  expect(T.getDepositRecord().failed.text).toMatch(/failed on BNB Chain/);
});
