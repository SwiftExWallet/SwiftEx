// One deposit tracker for the whole app session (Perps tab, pill and the Deposit sheet).
// The deposit keeps running when the sheet is closed; progress lives here (memory) plus a small
// AsyncStorage record (amount, tx hashes, times — no secrets) so a relaunch can resume tracking.
// "Credited in Perps" uses the shared account poller (usePerpsAccount): PerpsHome feeds each new
// Perps wallet balance into onPerpsBalance(); there is no separate Aster poller.
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { executeDeposit, getPendingNonce, getLatestNonce } from "../api/asterFunds";
import { gt, isValid, mul, sub } from "../utils/decimal";

const STORAGE_KEY = "perps_deposit_pending";
const NONCE_WATCH_MS = 2000;
const RESUME_SEND_GRACE_MS = 3 * 60 * 1000; // after a relaunch: how long to look for the deposit tx
const SLOW_CREDIT_MS = 30 * 60 * 1000; // after this, say "taking longer than usual"
const CREDIT_TOLERANCE = "0.99"; // rise must be >= 99% of the amount (funding / rounding)

// record: {
//   user, amount, needsApprove, baseline, startedAt,
//   approveStartAt, approvedAt, approveHash,
//   depositStartAt, nonceBeforeDeposit, sentAt, confirmedAt, depositHash,
//   creditedAt, creditedBalance,
//   failed: null | { step: 'approve'|'deposit'|'resume', text },
//   slow, unknownHash
// }
let record = null;
let loaded = false;
let loadPromise = null;
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

export const isDepositFinished = (r) => !!r && (!!r.creditedAt || !!r.failed);
export const isDepositActive = (r) => !!r && !isDepositFinished(r);
export const getDepositRecord = () => record;

// User-facing text for a failed approve/deposit step (never raw RPC dumps).
const friendlyTxError = (err, step) => {
  const m = String(err || "");
  if (/cancel/i.test(m)) {
    return step === "deposit"
      ? "You cancelled. The approval went through, but no USDT was sent."
      : "You cancelled. Nothing was sent.";
  }
  if (/revert/i.test(m)) {
    return step === "deposit"
      ? "The deposit failed on BNB Smart Chain. Your USDT is still in your wallet (only gas was spent)."
      : "The approval failed on BNB Smart Chain. Nothing was deposited (only gas was spent).";
  }
  if (/insufficient funds/i.test(m)) return "Not enough BNB to pay the network fee.";
  if (/PIN|auth|biometric/i.test(m)) return "Couldn't confirm it's you. Nothing was sent.";
  return step === "deposit"
    ? "The deposit couldn't be sent. Check your connection and try again."
    : "The approval couldn't be sent. Check your connection and try again.";
};

// Watch the wallet's pending nonce while a tx call runs, to time "Deposit sent" before the
// confirmation comes back. Returns a stop function.
const watchNonce = (user, from, onMoved) => {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const n = await getPendingNonce(user).catch(() => null);
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

// Start a deposit. `plan` comes from prepareDeposit; `baseline` is the current Perps wallet
// balance (string) or null if unknown. Resolves when the on-chain part is done (or failed).
export const startDeposit = async ({ user, plan, baseline }) => {
  if (isDepositActive(record)) return;
  const now = Date.now();
  set({
    user,
    amount: plan.amount,
    needsApprove: plan.needsApprove,
    baseline: isValid(baseline) ? String(baseline) : null,
    startedAt: now,
    approveStartAt: plan.needsApprove ? now : null,
    approvedAt: null,
    approveHash: null,
    depositStartAt: plan.needsApprove ? null : now,
    nonceBeforeDeposit: null,
    sentAt: null,
    confirmedAt: null,
    depositHash: null,
    creditedAt: null,
    creditedBalance: null,
    failed: null,
    slow: false,
    unknownHash: false,
  });

  let stopWatch = () => {};
  const onStep = async (step) => {
    if (step === "approving") return;
    if (step === "depositing") {
      const n = await getPendingNonce(user).catch(() => null);
      patch({ depositStartAt: record.depositStartAt || Date.now(), approvedAt: plan.needsApprove ? Date.now() : null, nonceBeforeDeposit: n });
      stopWatch = watchNonce(user, n, () => {
        if (record && !record.sentAt) patch({ sentAt: Date.now() });
      });
    }
  };

  const res = await executeDeposit(user, plan, onStep).catch((e) => ({ ok: false, step: "deposit", error: e && e.message }));
  stopWatch();
  if (!record) return;
  if (res.approveHash) patch({ approveHash: res.approveHash });
  if (res.ok) {
    const t = Date.now();
    patch({ depositHash: res.txHash || null, sentAt: record.sentAt || t, confirmedAt: t });
    return;
  }
  // The app's tx helper gives up waiting after 90s, but the tx may still confirm. If the deposit
  // nonce moved, keep tracking via the Perps balance instead of reporting a failure.
  if (res.step === "deposit" && !res.txHash && /timeout/i.test(String(res.error || ""))) {
    const latest = await getLatestNonce(user).catch(() => null);
    if (latest !== null && record.nonceBeforeDeposit !== null && latest > record.nonceBeforeDeposit) {
      const t = Date.now();
      patch({ sentAt: record.sentAt || t, confirmedAt: t, unknownHash: true });
      return;
    }
  }
  patch({
    depositHash: res.txHash || null,
    failed: { step: res.step === "approve" ? "approve" : "deposit", text: friendlyTxError(res.error, res.step) },
  });
};

// Feed every new Perps wallet balance (from the shared account poller) for this user.
export const onPerpsBalance = (user, walletBalance) => {
  const r = record;
  if (!isDepositActive(r) || !user || r.user.toLowerCase() !== user.toLowerCase() || !isValid(walletBalance)) return;
  if (r.baseline === null) {
    patch({ baseline: String(walletBalance) });
    return;
  }
  // Funding / fees / a withdrawal can lower the balance meanwhile: follow it down.
  if (gt(r.baseline, walletBalance)) {
    patch({ baseline: String(walletBalance) });
    return;
  }
  if (!r.confirmedAt && !r.unknownHash && !r.depositStartAt) return; // deposit step not started yet
  const rise = sub(walletBalance, r.baseline);
  if (!gt(mul(r.amount, CREDIT_TOLERANCE), rise)) {
    patch({ creditedAt: Date.now(), creditedBalance: String(walletBalance), sentAt: r.sentAt || Date.now(), confirmedAt: r.confirmedAt || Date.now() });
  } else if (r.confirmedAt && !r.slow && Date.now() - r.confirmedAt > SLOW_CREDIT_MS) {
    patch({ slow: true });
  }
};

export const clearDeposit = () => set(null);

// After a relaunch, a deposit that was mid-way: work out whether the deposit tx went out.
const resume = async () => {
  const r = record;
  if (!isDepositActive(r) || r.confirmedAt) return;
  if (r.nonceBeforeDeposit === null || r.nonceBeforeDeposit === undefined) {
    // The app closed before the deposit step started: nothing was deposited.
    patch({ failed: { step: "resume", text: "The app closed before the deposit was sent. Your USDT is still in your wallet." } });
    return;
  }
  const until = Date.now() + RESUME_SEND_GRACE_MS;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const latest = await getLatestNonce(r.user).catch(() => null);
    if (record !== r && (!record || record.startedAt !== r.startedAt)) return;
    if (latest !== null && latest > r.nonceBeforeDeposit) {
      const t = Date.now();
      patch({ sentAt: record.sentAt || t, confirmedAt: t, unknownHash: !record.depositHash });
      return;
    }
    if (Date.now() > until) {
      patch({ failed: { step: "resume", text: "The deposit wasn't sent before the app closed. Check your wallet history." } });
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => setTimeout(res, 10000));
  }
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
            set(r);
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
