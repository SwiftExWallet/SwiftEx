// Perps history store: income rows (all symbols) + deposit/withdraw records, cached per wallet.
// Row-based paging (utils/historyPaging.js) over GET /fapi/v3/incomePage:
// - Open: show the cache at once, then fetch only rows newer than the newest cached one.
// - Scroll: the next ~200 older rows on demand, as far back as Aster has data.
// - Periods: ensureCovered(from) loads older rows (1000 per page, bounded) until the period is
//   fully loaded, so totals are never computed on a partial period without saying so.
// - Cache: newest PERSIST_ROWS rows in AsyncStorage + memory; the stored range is exact.
// - No polling; loops stop when the screen closes or the app goes to the background
//   (late results are ignored); no setState after unmount; one fetch at a time.
// Transfers: POST /fapi/v3/aster/deposit-withdraw-history has no paging parameters, so it is
// fetched whole (it is small) when needed.
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchIncomePage, fetchTransferHistory } from "../api/asterHistory";
import { getServerNowMs } from "../api/asterSigned";
import {
  BIG_PAGE_ROWS,
  PAGE_ROWS,
  coveredFrom as coveredFromOf,
  emptyState,
  loadOlder as pagerLoadOlder,
  refreshNewest,
  trimForPersist,
} from "../utils/historyPaging";

const CACHE_VERSION = 2;
const keyFor = (user) => `perps_history_v${CACHE_VERSION}_${String(user).toLowerCase()}`;
const PENDING_STATES = ["PROCESSING", "PENDING", "INIT", "SUBMITTED"];
const COVER_MAX_REQUESTS = 20; // per period switch; beyond that the summary says "partial"

// Module memory per wallet: { state (pager), transfers, savedAt } — second open needs no storage I/O.
const memory = new Map();
const stats = { requests: 0, lastOpen: [] };
if (typeof __DEV__ !== "undefined" && __DEV__) globalThis.__perpsHistoryStats = stats;

const readCache = async (user) => {
  if (memory.has(user)) return memory.get(user);
  try {
    const raw = await AsyncStorage.getItem(keyFor(user));
    const c = raw ? JSON.parse(raw) : null;
    if (c && c.state && Array.isArray(c.state.items)) {
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
  const persisted = { ...c, state: trimForPersist(c.state) };
  AsyncStorage.setItem(keyFor(user), JSON.stringify(persisted)).catch(() => {});
};

// Adapter: pager fetchPage -> signed incomePage.
const pageFetcher = (agent, user, counter) => async (p) => {
  counter.n += 1;
  const r = await fetchIncomePage(agent, user, p);
  if (r.error) return { error: r.error, code: r.code, agentInvalid: r.agentInvalid };
  return { rows: r.rows, total: r.total, hasMore: r.hasMore };
};

export const usePerpsHistory = ({ agent, user, active }) => {
  const [data, setData] = useState(() => (user && memory.get(user)) || null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [covering, setCovering] = useState(false);
  const [partialFrom, setPartialFrom] = useState(null); // period not fully loaded (request cap)
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const gen = useRef(0); // bumps when the screen closes / goes to background: stop loops
  const agentRef = useRef(agent);
  agentRef.current = agent;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      gen.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!active) gen.current += 1;
  }, [active]);

  const apply = useCallback(
    (c) => {
      writeCache(user, c);
      if (mounted.current) setData(c);
    },
    [user]
  );

  const refresh = useCallback(
    async ({ pull = false } = {}) => {
      const ag = agentRef.current;
      if (!ag || !user || busy.current) return;
      busy.current = true;
      const myGen = gen.current;
      const counter = { n: 0 };
      if (mounted.current) {
        setError(null);
        if (pull) setRefreshing(true);
      }
      try {
        const cached = await readCache(user);
        if (mounted.current && cached) setData(cached);
        if (mounted.current && !cached) setLoading(true);
        const base = cached || { state: emptyState(), transfers: [], savedAt: 0 };
        const r = await refreshNewest(base.state, pageFetcher(ag, user, counter), { nowMs: Math.trunc(getServerNowMs()) });
        if (gen.current !== myGen) return; // closed meanwhile: ignore
        if (r.error) {
          if (mounted.current) setError(r.error);
          return;
        }
        const known = new Set(base.state.items.map((it) => it.k));
        const newTransfer = r.state.items.some((it) => (it.type === "DEPOSIT" || it.type === "WITHDRAW") && !known.has(it.k));
        const pending = (base.transfers || []).some((t) => PENDING_STATES.includes(t.state));
        let transfers = base.transfers || [];
        if (!cached || pull || newTransfer || pending) {
          counter.n += 1;
          const tr = await fetchTransferHistory(ag, user);
          if (gen.current !== myGen) return;
          if (!tr.error) transfers = tr.data.slice(0, 200);
        }
        apply({ state: r.state, transfers, savedAt: Date.now() });
      } catch (e) {
        if (mounted.current) setError({ error: "Couldn't load your history. Check your connection." });
      } finally {
        stats.requests += counter.n;
        stats.lastOpen = [...stats.lastOpen.slice(-9), { at: Date.now(), requests: counter.n, pull }];
        busy.current = false;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [user, apply]
  );

  // Next ~200 older rows (infinite scroll).
  const loadOlder = useCallback(async () => {
    const ag = agentRef.current;
    const c = user && memory.get(user);
    if (!ag || !c || c.state.done || busy.current) return;
    busy.current = true;
    const myGen = gen.current;
    const counter = { n: 0 };
    if (mounted.current) setLoadingOlder(true);
    try {
      const r = await pagerLoadOlder(c.state, pageFetcher(ag, user, counter), { nowMs: Math.trunc(getServerNowMs()), limit: PAGE_ROWS });
      if (gen.current !== myGen) return;
      if (r.error) {
        if (mounted.current) setError(r.error);
        return;
      }
      apply({ ...(memory.get(user) || c), state: r.state, savedAt: Date.now() });
    } finally {
      stats.requests += counter.n;
      busy.current = false;
      if (mounted.current) setLoadingOlder(false);
    }
  }, [user, apply]);

  // Load (bounded) until every row since `from` is loaded, for correct period totals.
  const ensureCovered = useCallback(
    async (from) => {
      const ag = agentRef.current;
      const c = user && memory.get(user);
      if (!ag || !c || busy.current) return;
      const covered = (s) => s.done || (coveredFromOf(s) !== null && coveredFromOf(s) <= from);
      if (covered(c.state)) {
        if (mounted.current) setPartialFrom(null);
        return;
      }
      busy.current = true;
      const myGen = gen.current;
      const counter = { n: 0 };
      if (mounted.current) setCovering(true);
      let s = c.state;
      try {
        while (!covered(s) && counter.n < COVER_MAX_REQUESTS) {
          // eslint-disable-next-line no-await-in-loop
          const r = await pagerLoadOlder(s, pageFetcher(ag, user, counter), { nowMs: Math.trunc(getServerNowMs()), limit: BIG_PAGE_ROWS });
          if (gen.current !== myGen) return;
          if (r.error) {
            if (mounted.current) setError(r.error);
            break;
          }
          s = r.state;
          apply({ ...(memory.get(user) || c), state: s, savedAt: Date.now() });
        }
        if (mounted.current) setPartialFrom(covered(s) ? null : coveredFromOf(s));
      } finally {
        stats.requests += counter.n;
        busy.current = false;
        if (mounted.current) setCovering(false);
      }
    },
    [user, apply]
  );

  useEffect(() => {
    if (active && agent && user) refresh();
  }, [active, agent, user, refresh]);

  const d = data || { state: emptyState(), transfers: [] };
  return {
    items: d.state.items,
    transfers: d.transfers || [],
    coveredFrom: coveredFromOf(d.state),
    reachedEnd: !!d.state.done,
    hasData: !!data,
    loading,
    refreshing,
    loadingOlder,
    covering,
    partialFrom,
    error,
    refresh,
    loadOlder,
    ensureCovered,
  };
};
