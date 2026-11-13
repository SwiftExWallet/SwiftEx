// Perps history store: income rows (all symbols) + deposit/withdraw records, cached per wallet.
// - Open: show the AsyncStorage cache at once, then fetch ONLY rows newer than the newest cached
//   one (incremental, deduped by incomeType + tranId).
// - Older data: loadOlder() extends the covered range back in 30-day chunks, capped at 90 days.
// - No polling: refresh happens on open, pull-to-refresh, or when the caller asks (e.g. after a
//   trade / close / deposit / withdraw finishes). No setState after unmount.
// Cache holds no secrets: amounts, symbols, times, ids, tx hashes.
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchIncomeRange, fetchTransferHistory } from "../api/asterHistory";
import { getServerNowMs } from "../api/asterSigned";

const DAY = 24 * 60 * 60 * 1000;
const FIRST_WINDOW = 7 * DAY;
const OLDER_CHUNK = 30 * DAY;
export const HISTORY_MAX_DAYS = 90;
const MAX_ITEMS = 3000;
const CACHE_VERSION = 1;
const keyFor = (user) => `perps_history_v${CACHE_VERSION}_${String(user).toLowerCase()}`;

const rowKey = (r) => `${r.incomeType}:${r.tranId}`;
const PENDING_STATES = ["PROCESSING", "PENDING", "INIT", "SUBMITTED"];

const EMPTY = { items: [], transfers: [], coveredFrom: null, newestTime: 0, savedAt: 0 };

// Module memory: per wallet, survives screen close (second open is instant without storage I/O).
const memory = new Map();
const stats = { requests: 0, lastOpen: [] }; // request counts (dev checks)
if (typeof __DEV__ !== "undefined" && __DEV__) globalThis.__perpsHistoryStats = stats;

const normalize = (r) => ({
  k: rowKey(r),
  type: r.incomeType,
  symbol: r.symbol || "",
  income: String(r.income),
  asset: r.asset || "USDT",
  time: Number(r.time),
  tranId: String(r.tranId),
  tradeId: r.tradeId ? String(r.tradeId) : "",
  info: r.info || "",
});

const merge = (items, rows, floor) => {
  const map = new Map(items.map((it) => [it.k, it]));
  rows.forEach((r) => {
    const n = normalize(r);
    map.set(n.k, n);
  });
  return Array.from(map.values())
    .filter((it) => it.time >= floor)
    .sort((a, b) => b.time - a.time)
    .slice(0, MAX_ITEMS);
};

const readCache = async (user) => {
  if (memory.has(user)) return memory.get(user);
  try {
    const raw = await AsyncStorage.getItem(keyFor(user));
    const c = raw ? JSON.parse(raw) : null;
    if (c && Array.isArray(c.items)) {
      memory.set(user, c);
      return c;
    }
  } catch (e) {
    // broken cache: start fresh
  }
  return null;
};

const writeCache = (user, c) => {
  memory.set(user, c);
  AsyncStorage.setItem(keyFor(user), JSON.stringify(c)).catch(() => {});
};

// usePerpsHistory({ agent, user, active }) -> { ...data, loading, refreshing, loadingOlder, error,
//   reachedEnd, refresh, loadOlder }
export const usePerpsHistory = ({ agent, user, active }) => {
  const [data, setData] = useState(() => (user && memory.get(user)) || null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const agentRef = useRef(agent);
  agentRef.current = agent;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const apply = useCallback(
    (c) => {
      writeCache(user, c);
      if (mounted.current) setData(c);
    },
    [user]
  );

  // Fetch rows newer than the cache (or the first 7 days) + transfers when needed.
  const refresh = useCallback(
    async ({ pull = false } = {}) => {
      const ag = agentRef.current;
      if (!ag || !user || busy.current) return;
      busy.current = true;
      if (mounted.current) {
        setError(null);
        if (pull) setRefreshing(true);
      }
      let reqs = 0;
      try {
        const cached = (await readCache(user)) || null;
        if (mounted.current && cached) setData(cached);
        if (mounted.current && !cached) setLoading(true);
        const base = cached || EMPTY;
        const now = Math.trunc(getServerNowMs());
        const floor = now - HISTORY_MAX_DAYS * DAY;
        const start = cached && cached.newestTime ? cached.newestTime : now - FIRST_WINDOW;
        const inc = await fetchIncomeRange(ag, user, start, now);
        reqs += inc.requests || 0;
        if (inc.error) {
          if (mounted.current) setError(inc);
          return;
        }
        const items = merge(base.items, inc.rows, floor);
        // startTime is inclusive, so the newest cached row comes back again: only count unseen rows.
        const known = new Set(base.items.map((it) => it.k));
        const newTransferRows = inc.rows.some(
          (r) => (r.incomeType === "DEPOSIT" || r.incomeType === "WITHDRAW") && !known.has(rowKey(r))
        );
        const pendingTransfer = (base.transfers || []).some((t) => PENDING_STATES.includes(t.state));
        let transfers = base.transfers || [];
        if (!cached || pull || newTransferRows || pendingTransfer) {
          const tr = await fetchTransferHistory(ag, user);
          reqs += 1;
          if (!tr.error) transfers = tr.data.slice(0, 200);
        }
        apply({
          items,
          transfers,
          coveredFrom: base.coveredFrom ? Math.max(base.coveredFrom, floor) : start,
          newestTime: items.length ? Math.max(items[0].time, base.newestTime || 0) : base.newestTime || 0,
          savedAt: Date.now(),
        });
      } catch (e) {
        if (mounted.current) setError({ error: "Couldn't load your history. Check your connection." });
      } finally {
        stats.requests += reqs;
        stats.lastOpen = [...stats.lastOpen.slice(-9), { at: Date.now(), requests: reqs, pull }];
        busy.current = false;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [user, apply]
  );

  // Extend the covered range back until `targetFrom` (one 30-day chunk per call; 90-day cap).
  const loadOlder = useCallback(
    async (targetFrom) => {
      const ag = agentRef.current;
      const c = user && memory.get(user);
      if (!ag || !c || busy.current) return;
      const now = Math.trunc(getServerNowMs());
      const floor = now - HISTORY_MAX_DAYS * DAY;
      const goal = Math.max(floor, targetFrom || floor);
      if (!c.coveredFrom || c.coveredFrom <= goal) return;
      busy.current = true;
      if (mounted.current) setLoadingOlder(true);
      let reqs = 0;
      try {
        const start = Math.max(goal, c.coveredFrom - OLDER_CHUNK);
        const inc = await fetchIncomeRange(ag, user, start, c.coveredFrom - 1);
        reqs += inc.requests || 0;
        if (inc.error) {
          if (mounted.current) setError(inc);
          return;
        }
        const cur = memory.get(user) || c;
        apply({ ...cur, items: merge(cur.items, inc.rows, floor), coveredFrom: start, savedAt: Date.now() });
      } finally {
        stats.requests += reqs;
        busy.current = false;
        if (mounted.current) setLoadingOlder(false);
      }
    },
    [user, apply]
  );

  useEffect(() => {
    if (active && agent && user) refresh();
  }, [active, agent, user, refresh]);

  const d = data || EMPTY;
  const now = Date.now();
  return {
    items: d.items,
    transfers: d.transfers || [],
    coveredFrom: d.coveredFrom,
    reachedEnd: !!d.coveredFrom && d.coveredFrom <= now - HISTORY_MAX_DAYS * DAY + DAY,
    hasData: !!data,
    loading,
    refreshing,
    loadingOlder,
    error,
    refresh,
    loadOlder,
  };
};
