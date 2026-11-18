// One withdrawal at a time (any asset / chain), tracked for the whole app session + relaunches.
// The record is saved BEFORE the request is sent, so if the app dies mid-request the outcome is
// recovered from Aster's withdraw history (never sent twice: each request has a fresh time-based
// nonce and the user must confirm again). Arrival = the on-chain receipt of Aster's payout tx.
// AsyncStorage holds no secrets: asset, chain, amounts, times, tx hash.
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withdrawWithMainWallet, fetchWithdrawHistory, withChainProvider } from "../api/asterFunds";
import { chainById } from "../api/asterAssets";
import { sub } from "../utils/decimal";

const STORAGE_KEY = "perps_withdraw_pending";
const POLL_MS = 10000;
const POLL_MAX_MS = 60000;
const LOST_REQUEST_MS = 3 * 60 * 1000; // no history row this long after an interrupted send = not sent
const SLOW_MS = 30 * 60 * 1000;

// record: { user, asset, chainId, amount, fee, receive, startedAt, phase: 'sending'|'requested',
//   requestedAt, processingAt, sentAt, receivedAt, status, txHash, slow, failed: null|{ text, nothingSent } }
let record = null;
let loaded = false;
let loadPromise = null;
let running = false;
const listeners = new Set();

const persist = () => {
  const r = record;
  const done = !r || r.receivedAt || r.failed;
  (done ? AsyncStorage.removeItem(STORAGE_KEY) : AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(r))).catch(() => {});
};
const set = (next) => {
  record = next;
  persist();
  listeners.forEach((fn) => fn(record));
};
const patch = (p) => {
  if (record) set({ ...record, ...p });
};

export const isWithdrawFinished = (r) => !!r && (!!r.receivedAt || !!r.failed);
export const isWithdrawActive = (r) => !!r && !isWithdrawFinished(r);
export const isWithdrawSending = () => running;

// Send a withdrawal (main wallet signs, one PIN prompt). Resolves { ok, error }.
export const startWithdraw = async ({ user, asset, chainId, amount, fee }) => {
  if (running || isWithdrawActive(record)) return { ok: false, error: "Another withdrawal is still in progress." };
  running = true;
  const now = Date.now();
  set({
    user,
    asset,
    chainId: Number(chainId),
    amount,
    fee,
    receive: sub(amount, fee),
    startedAt: now,
    phase: "sending",
    requestedAt: null,
    processingAt: null,
    sentAt: null,
    receivedAt: null,
    status: null,
    txHash: null,
    slow: false,
    failed: null,
  });
  try {
    const res = await withdrawWithMainWallet(user, amount, fee, { asset, chainId });
    if (res.error && (res.code === null || res.code === undefined)) {
      // No Aster error code = transport problem (timeout / no network): the request may have
      // arrived. Keep the record; the history poll decides (and never resends).
      patch({ phase: "sending", unsure: true });
      return { ok: false, error: "Couldn't reach Aster. Checking whether the request arrived…" };
    }
    if (res.error) {
      const code = res.code !== null && res.code !== undefined ? ` (${res.code})` : "";
      patch({ failed: { text: `Aster didn't accept the withdrawal: ${res.error}${code}`, nothingSent: true } });
      return { ok: false, error: res.error };
    }
    patch({ phase: "requested", requestedAt: Date.now(), status: "PROCESSING" });
    return { ok: true };
  } catch (e) {
    const m = String((e && e.message) || "");
    const text = /cancel/i.test(m)
      ? "You cancelled. Nothing was sent."
      : e && e.step === "verify"
      ? m
      : /network|timeout|fetch/i.test(m)
      ? "Couldn't reach Aster. Checking whether the request arrived…"
      : "The withdrawal couldn't be signed. Nothing was sent.";
    if (/network|timeout|fetch/i.test(m)) {
      // The POST may have arrived: keep the record and let the history poll decide.
      patch({ phase: "sending", unsure: true });
      return { ok: false, error: text };
    }
    // Nothing left the device: clean state (shown once, not persisted).
    patch({ failed: { text, nothingSent: true } });
    return { ok: false, error: text };
  } finally {
    running = false;
  }
};

const matches = (row, r) =>
  row &&
  String(row.asset) === String(r.asset) &&
  (row.chainId === undefined || Number(row.chainId) === Number(r.chainId)) &&
  Math.abs(Number(row.amount) - Number(r.amount)) <= Math.max(1e-9, Number(r.amount) * 1e-6) &&
  Number(row.time) >= r.startedAt - 120000;

// Poll Aster's withdraw history (+ the chain receipt once there is a tx hash) while active.
export const watchWithdraw = (agent, user) => {
  let stopped = false;
  let delay = POLL_MS;
  let timer = null;
  const tick = async () => {
    timer = null;
    const r = record;
    if (stopped || !isWithdrawActive(r) || running) {
      if (!stopped && running) timer = setTimeout(tick, 2000);
      return;
    }
    if (!user || r.user.toLowerCase() !== user.toLowerCase()) return;
    const hist = await fetchWithdrawHistory(agent, user).catch(() => ({ error: "network" }));
    if (stopped) return;
    if (hist.error) {
      delay = Math.min(delay * 2, POLL_MAX_MS);
    } else {
      delay = POLL_MS;
      const row = (hist.data || []).find((x) => matches(x, record));
      const now = Date.now();
      if (!row && record.phase === "sending" && now - record.startedAt > LOST_REQUEST_MS) {
        patch({ failed: { text: "The withdrawal request didn't reach Aster. Nothing was withdrawn.", nothingSent: true } });
        return;
      }
      if (row) {
        const p = {
          phase: "requested",
          requestedAt: record.requestedAt || Number(row.time) || now,
          status: row.state,
          processingAt: record.processingAt || now,
          txHash: row.txHash || record.txHash,
        };
        if (row.state === "FAILED") p.failed = { text: "Aster didn't complete it. Your funds stay in Perps." };
        if (p.txHash && !record.sentAt) p.sentAt = now;
        patch(p);
        if (p.txHash && !p.failed) {
          const chain = chainById(record.chainId);
          const receipt = await withChainProvider(chain.key, chain.chainId, (pr) => pr.getTransactionReceipt(p.txHash)).catch(() => null);
          if (stopped) return;
          if (receipt && receipt.status === 1) {
            patch({ receivedAt: Date.now() });
            return;
          }
        }
      }
      if (record && !record.slow && record.requestedAt && now - record.requestedAt > SLOW_MS) patch({ slow: true });
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, 1000);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
};

export const clearWithdraw = () => {
  if (!running) set(null);
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
          if (r && r.user && r.amount && r.startedAt) set(r);
        } catch (e) {
          // ignore
        }
      })
      .catch(() => {
        loaded = true;
      });
  }
  return loadPromise;
};

export const useWithdrawTracker = () => {
  const [r, setR] = useState(record);
  useEffect(() => {
    listeners.add(setR);
    setR(record);
    load();
    return () => {
      listeners.delete(setR);
    };
  }, []);
  return { record: r, active: isWithdrawActive(r), finished: isWithdrawFinished(r) };
};
