import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAccount, fetchOpenOrders, fetchPositions } from "../api/asterTrade";
import { asterWs } from "../api/asterWs";
import { isValid, toUnits } from "../utils/decimal";

const POLL_MS = 5000;
const NO_DEPOSIT_CODE = -5050;

// ONE account store + poller for the whole app session, shared by the Perps tab and the market
// screen: no duplicate polling, and a screen opened later shows the last known account at once.
// Polls every 5s while at least one screen using it is active (focused).
const EMPTY = {
  key: null, // `${agentAddress}|${user}`
  account: null, // { equity, available, walletBalance, unrealizedPnl }
  positions: [],
  openOrders: [],
  noDeposit: false,
  error: null,
  loading: false,
  updatedAt: 0,
  invalidAt: 0, // set when Aster says the agent is no longer valid
};
let store = { ...EMPTY };
const listeners = new Set();
const setStore = (patch) => {
  store = { ...store, ...patch };
  listeners.forEach((fn) => fn(store));
};

let current = null; // { agent, user, key }
let inflight = null;
let timer = null;
const activeTokens = new Set();

const keyOf = (agent, user) => (agent && user ? `${agent.address}|${user}` : null);

const refreshStore = () => {
  if (!current) return Promise.resolve();
  if (inflight) return inflight;
  const { agent, user, key } = current;
  setStore({ loading: true });
  inflight = (async () => {
    const [acc, pos, ord] = await Promise.all([
      fetchAccount(agent, user),
      fetchPositions(agent, user),
      fetchOpenOrders(agent, user),
    ]);
    if (!current || current.key !== key) return; // agent/wallet changed meanwhile
    if (acc.agentInvalid || pos.agentInvalid || ord.agentInvalid) {
      setStore({ invalidAt: Date.now() });
      return;
    }
    if ([acc, pos, ord].some((r) => r.code === NO_DEPOSIT_CODE)) {
      setStore({
        noDeposit: true,
        account: { equity: "0", available: "0", walletBalance: "0", unrealizedPnl: "0" },
        positions: [],
        openOrders: [],
        error: null,
        updatedAt: Date.now(),
      });
      return;
    }
    const firstError = [acc, pos, ord].find((r) => r.error);
    const patch = { noDeposit: false, error: firstError ? firstError.error : null, updatedAt: Date.now() };
    if (!acc.error && acc.data) {
      const d = acc.data;
      patch.account = {
        equity: String(d.totalMarginBalance ?? "0"),
        available: String(d.availableBalance ?? "0"),
        walletBalance: String(d.totalWalletBalance ?? "0"),
        unrealizedPnl: String(d.totalUnrealizedProfit ?? "0"),
      };
    }
    if (!pos.error && Array.isArray(pos.data)) {
      patch.positions = pos.data.filter((p) => isValid(p.positionAmt) && !toUnits(p.positionAmt).isZero());
    }
    if (!ord.error && Array.isArray(ord.data)) patch.openOrders = ord.data;
    setStore(patch);
  })().finally(() => {
    inflight = null;
    setStore({ loading: false });
  });
  return inflight;
};

const ensurePolling = () => {
  if (activeTokens.size > 0 && current && !timer) {
    timer = setInterval(refreshStore, POLL_MS);
  } else if ((activeTokens.size === 0 || !current) && timer) {
    clearInterval(timer);
    timer = null;
  }
};

const useAgentBinding = (agent, user) => {
  const key = keyOf(agent, user);
  if (key && (!current || current.key !== key)) {
    current = { agent, user, key };
    store = { ...EMPTY, key };
  } else if (!key && current) {
    // keep the last store until a new agent arrives; polling stops below
  }
  return key;
};

// Same API as before: { account, positions, openOrders, noDeposit, error, loading, marks, refresh }.
export const usePerpsAccount = ({ agent, user, active, onAgentInvalid }) => {
  const key = useAgentBinding(agent, user);
  const [snap, setSnap] = useState(() => (key && store.key === key ? store : { ...EMPTY }));
  const [marks, setMarks] = useState({}); // symbol -> mark price (number)
  const invalidRef = useRef(onAgentInvalid);
  invalidRef.current = onAgentInvalid;
  const seenInvalidRef = useRef(store.invalidAt);

  useEffect(() => {
    const onStore = (s) => {
      if (s.key !== key) return;
      setSnap(s);
      if (s.invalidAt && s.invalidAt !== seenInvalidRef.current) {
        seenInvalidRef.current = s.invalidAt;
        if (invalidRef.current) invalidRef.current();
      }
    };
    listeners.add(onStore);
    setSnap(key && store.key === key ? store : { ...EMPTY });
    return () => {
      listeners.delete(onStore);
    };
  }, [key]);

  // Poll while this screen is active; refresh right away if the data is older than one poll.
  useEffect(() => {
    if (!active || !key) return undefined;
    const token = {};
    activeTokens.add(token);
    if (Date.now() - store.updatedAt >= POLL_MS) refreshStore();
    ensurePolling();
    return () => {
      activeTokens.delete(token);
      ensurePolling();
    };
  }, [active, key]);

  const refresh = useCallback(() => refreshStore(), []);

  // Live mark prices for open positions.
  const positions = key && snap.key === key ? snap.positions : [];
  const positionSymbols = positions.map((p) => p.symbol).sort().join(",");
  useEffect(() => {
    if (!active || !positionSymbols) return undefined;
    const wanted = new Set(positionSymbols.split(","));
    const pending = {};
    const off = asterWs.subscribe("!markPrice@arr@1s", (data) => {
      if (!Array.isArray(data)) return;
      data.forEach((m) => {
        if (wanted.has(m.s)) pending[m.s] = Number(m.p);
      });
    });
    const flush = setInterval(() => {
      if (Object.keys(pending).length === 0) return;
      const copy = { ...pending };
      Object.keys(pending).forEach((k) => delete pending[k]);
      setMarks((prev) => ({ ...prev, ...copy }));
    }, 1000);
    return () => {
      off();
      clearInterval(flush);
    };
  }, [active, positionSymbols]);

  const mine = key && snap.key === key;
  return {
    account: mine ? snap.account : null,
    positions,
    openOrders: mine ? snap.openOrders : [],
    noDeposit: mine ? snap.noDeposit : false,
    error: mine ? snap.error : null,
    loading: mine ? snap.loading : false,
    marks,
    refresh,
  };
};
