// One deposit at a time for the whole app session (Perps tab, pill and the Deposit sheet), any
// chain / asset. The deposit keeps running when the sheet is closed; progress lives here (memory)
// plus a small AsyncStorage record (chain, asset, amount, tx hashes, times, nonce — no secrets)
// so a relaunch resumes it.
// "Credited in Perps":
//   - Aster's deposit history (row with our tx hash, state SUCCESS) — any asset; polled by
//     watchCredit() while the Perps tab is open and the app is in front (10s, backoff on errors);
//   - for USDT also the shared account poller's balance (onPerpsBalance), which is usually first.
// Never reports "failed" unless the chain/wallet says so: timeouts / RPC errors after sending
// become "still processing", checked with the wallet nonce.
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { executeChainDeposit, getPendingNonce, getLatestNonce, prepareChainDeposit } from "../api/asterFunds";
import { fetchTransferHistory } from "../api/asterHistory";
import { chainById } from "../api/asterAssets";
import { gt, isValid, mul, sub } from "../utils/decimal";

const STORAGE_KEY = "perps_deposit_pending";
const NONCE_WATCH_MS = 2000;
const SEND_GRACE_MS = 3 * 60 * 1000; // how long a sent-but-unseen tx may take to show up
const SLOW_CREDIT_MS = 30 * 60 * 1000; // after this, say "taking longer than usual"
const CREDIT_TOLERANCE = "0.99";
const CREDIT_POLL_MS = 10000;
const CREDIT_POLL_MAX_MS = 60000;

// record: {
//   user, chainId, chainKey, asset, decimals, isNative, amount, needsApprove, baseline, startedAt,
//   approveStartAt, approvedAt, approveHash,
//   depositStartAt, nonceBeforeDeposit, sentAt, confirmedAt, depositHash,
//   creditedAt, creditedBalance, slow, unknownHash,
//   interrupted: null | { text, canContinue },   // deposit not sent; offer "Continue deposit"
//   failed: null | { step: 'approve'|'deposit'|'resume', text }
// }
let record = null;
let loaded = false;
let loadPromise = null;
let running = false; // a send is in progress in THIS app session (double-submit guard)
const listeners = new Set();

const persist = () => {
  const r = record;
  const done = !r || r.creditedAt || r.failed;
  (done ? AsyncStorage.removeItem(STORAGE_KEY) : AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(r))).catch(() => {});
};
const set = (next) => {
  record = next;
  persist();
  listeners.forEach((fn) => fn(record));
};
const patch = (p) => {
  if (!record) return;
  set({ ...record, ...p });
};
const chainOf = (r) => chainById(r && r.chainId ? r.chainId : 56);

export const isDepositFinished = (r) => !!r && (!!r.creditedAt || !!r.failed);
export const isDepositActive = (r) => !!r && !isDepositFinished(r);
export const isDepositSending = () => running;
export const getDepositRecord = () => record;

const friendlyTxError = (err, step, r) => {
  const m = String(err || "");
  const nat = chainOf(r).native;
  if (/cancel/i.test(m)) {
    return step === "deposit"
      ? "You cancelled. The approval went through, but nothing was deposited."
      : "You cancelled. Nothing was sent.";
  }
  if (/revert/i.test(m)) {
    return step === "deposit"
      ? `The deposit failed on ${chainOf(r).name}. Your ${r.asset} is still in your wallet (only gas was spent).`
      : `The approval failed on ${chainOf(r).name}. Nothing was deposited (only gas was spent).`;
  }
  if (/insufficient funds/i.test(m)) return `Not enough ${nat} to pay the network fee. Nothing was deposited.`;
  if (/PIN|auth|biometric/i.test(m)) return "Couldn't confirm it's you. Nothing was sent.";
  return step === "deposit"
    ? "The deposit couldn't be sent. Check your connection and try again."
    : "The approval couldn't be sent. Check your connection and try again.";
};

const watchNonce = (user, chain, from, onMoved) => {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const n = await getPendingNonce(user, chain).catch(() => null);
    if (stopped) return;
    if (n !== null && from !== null && n > from) {
      onMoved();
      return;
    }
    setTimeout(tick, NONCE_WATCH_MS);
  };
  setTimeout(tick, NONCE_WATCH_MS);
  return () => {
    stopped = true;
  };
};

// After a deposit-step error (not a cancel / revert): did the tx actually go out? Look at the
// wallet nonce for up to SEND_GRACE_MS. true = sent (keep tracking), false = not sent.
const depositWentOut = async (r) => {
  if (r.nonceBeforeDeposit === null || r.nonceBeforeDeposit === undefined) return false;
  const until = Date.now() + SEND_GRACE_MS;
  let checks = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const [latest, pending] = await Promise.all([
      getLatestNonce(r.user, chainOf(r)).catch(() => null),
      getPendingNonce(r.user, chainOf(r)).catch(() => null),
    ]);
    checks += 1;
    if (latest !== null && latest > r.nonceBeforeDeposit) return true; // mined
    // Nothing in the mempool either (2 reads in a row): it was never broadcast.
    if (pending !== null && latest !== null && pending <= r.nonceBeforeDeposit && checks >= 2) return false;
    if (Date.now() > until) return false; // dropped
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => setTimeout(res, checks < 3 ? 4000 : 10000));
  }
};

const run = async (plan) => {
  running = true;
  const user = record.user;
  const chain = chainOf(record);
  let stopWatch = () => {};
  const onStep = async (step) => {
    if (step === "approving") {
      if (record && !record.approveStartAt) patch({ approveStartAt: Date.now() });
      return;
    }
    if (step === "depositing") {
      const n = await getPendingNonce(user, chain).catch(() => null);
      patch({
        depositStartAt: Date.now(),
        approvedAt: plan.needsApprove ? Date.now() : record.approvedAt,
        nonceBeforeDeposit: n,
        interrupted: null,
      });
      stopWatch = watchNonce(user, chain, n, () => {
        if (record && !record.sentAt) patch({ sentAt: Date.now() });
      });
    }
  };
  try {
    const res = await executeChainDeposit(user, plan, onStep).catch((e) => ({ ok: false, step: "deposit", error: e && e.message }));
    stopWatch();
    if (!record) return;
    if (res.approveHash) patch({ approveHash: res.approveHash });
    if (res.ok) {
      const t = Date.now();
      patch({ depositHash: res.txHash || null, sentAt: record.sentAt || t, confirmedAt: t });
      return;
    }
    const msg = String(res.error || "");
    if (res.step === "deposit" && !/cancel|revert|insufficient funds|PIN|auth|biometric/i.test(msg)) {
      // Timeout / RPC / broadcast error after the deposit step started: maybe it went out.
      patch({ checking: true });
      const out = await depositWentOut(record);
      patch({ checking: false });
      if (out) {
        const t = Date.now();
        patch({ depositHash: res.txHash || record.depositHash || null, sentAt: record.sentAt || t, confirmedAt: t, unknownHash: !res.txHash });
        return;
      }
    }
    patch({ depositHash: res.txHash || null, failed: { step: res.step === "approve" ? "approve" : "deposit", text: friendlyTxError(res.error, res.step, record) } });
  } finally {
    running = false;
  }
};

// Start a deposit from a prepareChainDeposit plan. baseline = Perps USDT wallet balance or null.
// Returns false (and does nothing) if another deposit is still in progress.
export const startDeposit = async ({ user, plan, baseline }) => {
  if (running || isDepositActive(record)) return false;
  const now = Date.now();
  set({
    user,
    chainId: plan.chainId || 56,
    chainKey: plan.chainKey || "BNB",
    asset: plan.asset || "USDT",
    decimals: plan.decimals || 18,
    isNative: !!plan.isNative,
    contract: plan.contract || null,
    amount: plan.amount,
    needsApprove: plan.needsApprove,
    baseline: isValid(baseline) ? String(baseline) : null,
    startedAt: now,
    approveStartAt: plan.needsApprove ? now : null,
    approvedAt: null,
    approveHash: null,
    depositStartAt: null,
    nonceBeforeDeposit: null,
    sentAt: null,
    confirmedAt: null,
    depositHash: null,
    creditedAt: null,
    creditedBalance: null,
    failed: null,
    interrupted: null,
    slow: false,
    unknownHash: false,
  });
  await run(plan);
  return true;
};

// "Continue deposit" after an interruption (app closed before the deposit was sent). Re-checks
// the allowance, so a finished approval is not asked again.
export const continueDeposit = async () => {
  const r = record;
  if (!r || !r.interrupted || running) return { ok: false };
  const chain = chainOf(r);
  const asset = { name: r.asset, decimals: r.decimals, isNative: r.isNative, contract: r.contract };
  if (!asset.isNative && !asset.contract) return { ok: false, error: "Please start the deposit again." };
  // An approval sent before the app closed may still be confirming: don't send a second one.
  const [latest, pending] = await Promise.all([
    getLatestNonce(r.user, chain).catch(() => null),
    getPendingNonce(r.user, chain).catch(() => null),
  ]);
  if (latest !== null && pending !== null && pending > latest) {
    return { ok: false, error: "A transaction from your wallet is still confirming. Try again in a minute." };
  }
  const prep = await prepareChainDeposit({ chain, asset, user: r.user, amount: r.amount }).catch(() => null);
  if (!prep || !prep.ok) return { ok: false, error: (prep && prep.error) || "Couldn't check the deposit. Check your connection." };
  // Allowance already covers it (approval finished before the app closed): mark it done.
  const approvedNow = r.needsApprove && !prep.plan.needsApprove;
  patch({
    interrupted: null,
    approvedAt: approvedNow ? r.approvedAt || Date.now() : r.approvedAt,
    approveStartAt: prep.plan.needsApprove ? Date.now() : r.approveStartAt,
  });
  await run(prep.plan);
  return { ok: true };
};

export const cancelInterruptedDeposit = () => {
  if (record && record.interrupted && !running) set(null);
};

// Feed every new Perps USDT wallet balance (shared account poller). USDT deposits only.
export const onPerpsBalance = (user, walletBalance) => {
  const r = record;
  if (!isDepositActive(r) || r.interrupted || !user || r.user.toLowerCase() !== user.toLowerCase() || !isValid(walletBalance)) return;
  if (r.asset && r.asset !== "USDT") return;
  if (r.baseline === null) {
    patch({ baseline: String(walletBalance) });
    return;
  }
  if (gt(r.baseline, walletBalance)) {
    patch({ baseline: String(walletBalance) });
    return;
  }
  if (!r.confirmedAt && !r.unknownHash && !r.depositStartAt) return;
  const rise = sub(walletBalance, r.baseline);
  if (!gt(mul(r.amount, CREDIT_TOLERANCE), rise)) {
    patch({ creditedAt: Date.now(), creditedBalance: String(walletBalance), sentAt: r.sentAt || Date.now(), confirmedAt: r.confirmedAt || Date.now() });
  } else if (r.confirmedAt && !r.slow && Date.now() - r.confirmedAt > SLOW_CREDIT_MS) {
    patch({ slow: true });
  }
};

const matchesRecord = (row, r) => {
  if (!row || row.type !== "DEPOSIT") return false;
  if (r.depositHash && row.txHash) return row.txHash.toLowerCase() === r.depositHash.toLowerCase();
  // No hash (sent but the helper timed out): same asset + amount, after we started.
  const amt = Number(row.amount);
  return (
    String(row.asset) === String(r.asset) &&
    Math.abs(amt - Number(r.amount)) <= Math.max(1e-9, Number(r.amount) * 1e-6) &&
    Number(row.time) >= r.startedAt - 60000
  );
};

// Poll Aster's deposit history for the credit while `active` (screen open + app in front).
// Returns a stop function. Backs off on errors; never marks failure.
export const watchCredit = (agent, user) => {
  let stopped = false;
  let delay = CREDIT_POLL_MS;
  let timer = null;
  const tick = async () => {
    timer = null;
    const r = record;
    if (stopped || !isDepositActive(r) || r.interrupted || !r.confirmedAt) return;
    if (!user || r.user.toLowerCase() !== user.toLowerCase()) return;
    const res = await fetchTransferHistory(agent, user).catch(() => ({ error: "network" }));
    if (stopped) return;
    if (res.error) {
      delay = Math.min(delay * 2, CREDIT_POLL_MAX_MS);
    } else {
      delay = CREDIT_POLL_MS;
      const row = (res.data || []).find((x) => matchesRecord(x, record));
      if (row && row.state === "SUCCESS" && isDepositActive(record)) {
        patch({ creditedAt: Date.now(), depositHash: record.depositHash || row.txHash || null, unknownHash: false });
        return;
      }
      if (row && row.state === "FAILED" && isDepositActive(record)) {
        patch({ failed: { step: "deposit", text: "Aster reported this deposit as failed. Please contact support with the tx link." } });
        return;
      }
      if (row && row.txHash && !record.depositHash) patch({ depositHash: row.txHash, unknownHash: false });
      if (record.confirmedAt && !record.slow && Date.now() - record.confirmedAt > SLOW_CREDIT_MS) patch({ slow: true });
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, 1000);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
};

export const clearDeposit = () => {
  if (!running) set(null);
};

// After a relaunch, a deposit that was mid-way: work out what really happened.
const resume = async () => {
  const r = record;
  if (!isDepositActive(r) || r.confirmedAt || running) return;
  if (r.nonceBeforeDeposit !== null && r.nonceBeforeDeposit !== undefined) {
    patch({ checking: true });
    const out = await depositWentOut(r);
    if (!record || record.startedAt !== r.startedAt) return;
    if (out) {
      const t = Date.now();
      patch({ checking: false, sentAt: record.sentAt || t, confirmedAt: t, unknownHash: !record.depositHash });
      return;
    }
    patch({ checking: false });
  }
  // The deposit was not sent: offer to continue (approval, if any, is re-checked, not repeated).
  patch({
    interrupted: {
      text: r.needsApprove
        ? "The app closed before the deposit was sent. Your funds are still in your wallet."
        : "The app closed before the deposit was sent. Nothing left your wallet.",
      canContinue: true,
    },
  });
};

const load = () => {
  if (loaded) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        loaded = true;
        if (!raw || record) return;
        try {
          const r = JSON.parse(raw);
          if (r && r.user && r.amount && r.startedAt) {
            set({ ...r, checking: false });
            resume();
          }
        } catch (e) {
          // ignore a broken record
        }
      })
      .catch(() => {
        loaded = true;
      });
  }
  return loadPromise;
};

// { record, active, finished }
export const useDepositTracker = () => {
  const [r, setR] = useState(record);
  useEffect(() => {
    listeners.add(setR);
    setR(record);
    load();
    return () => {
      listeners.delete(setR);
    };
  }, []);
  return { record: r, active: isDepositActive(r), finished: isDepositFinished(r) };
};
