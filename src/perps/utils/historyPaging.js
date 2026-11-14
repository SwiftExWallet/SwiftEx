// Row-based paging over Aster's GET /fapi/v3/incomePage (pure: no React / RN imports, unit-tested).
//
// incomePage facts (Aster docs): rows sorted by time ASCENDING; params startTime/endTime (inclusive),
// page (1-based), limit (<= 1000); page × limit must not exceed 100,000; response has `total`.
//
// Walking BACKWARD from "now" without gaps:
//   A "segment" is a FIXED window [start|earliest .. end]. Its first request (page 1) tells us `total`;
//   the newest rows are on page ceil(total / limit), then page-1, page-2 … down to 1. Because the
//   window is fixed, those pages partition the window's rows exactly — rows sharing a timestamp are
//   never skipped or duplicated at page boundaries (rows are also deduped by incomeType + tranId).
//   When a segment is exhausted, the next one ends 1 ms before its start (or history is complete).
//   Windows whose total would break the 100k page rule are narrowed (7 days, halving).
// Catching up on open: rows newer than the newest cached one, oldest-first pages; if there are too
// many (catchupMax) the cache is dropped and the backward walk restarts from now (never a gap).

export const PAGE_ROWS = 200;
export const BIG_PAGE_ROWS = 1000;
export const CATCHUP_MAX = 2000;
export const PERSIST_ROWS = 2000;
const MAX_PAGE_PRODUCT = 100000;
const DAY = 24 * 60 * 60 * 1000;

export const rowKey = (r) => `${r.incomeType || r.type}:${r.tranId}`;

export const normalizeRow = (r) => ({
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

// Newest first; ties broken by key so the order is stable.
const cmp = (a, b) => b.time - a.time || (a.k < b.k ? 1 : a.k > b.k ? -1 : 0);

export const mergeRows = (items, rows) => {
  const map = new Map(items.map((it) => [it.k, it]));
  rows.forEach((r) => {
    const n = r.k ? r : normalizeRow(r);
    map.set(n.k, n);
  });
  return Array.from(map.values()).sort(cmp);
};

// state: { items, newestTime, cursor, done }
//   cursor: { start|null, end, limit, total|null, nextPage|null }  (nextPage null = not opened yet)
//   done:   true once the earliest record has been loaded
export const emptyState = () => ({ items: [], newestTime: 0, cursor: null, done: false });

export const oldestTime = (s) => (s.items.length ? s.items[s.items.length - 1].time : null);

// Oldest time we can vouch for: every row in [coveredFrom, newestTime] is loaded.
// (Rows AT the oldest loaded timestamp may still be partially loaded, hence +1 ms.)
export const coveredFrom = (s) => (s.done ? 0 : s.items.length ? oldestTime(s) + 1 : null);

const open = async (fetchPage, { start, end, limit }) => {
  let st = start;
  let reqs = 0;
  let span = 7 * DAY;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const r = await fetchPage({ startTime: st === null ? undefined : st, endTime: end, page: 1, limit });
    reqs += 1;
    if (r.error) return { error: r, reqs };
    const lastPage = Math.max(1, Math.ceil(r.total / limit));
    if (lastPage * limit <= MAX_PAGE_PRODUCT || span < 60 * 1000) {
      return { seg: { start: st, end, limit, total: r.total, firstPage: r, lastPage }, reqs };
    }
    // Too many rows for page arithmetic: narrow the window.
    st = Math.max(st === null ? 0 : st, end - span);
    span = Math.floor(span / 2);
  }
};

// Load the next ~limit OLDER rows (one or two requests). Returns { state, requests, error }.
export const loadOlder = async (state, fetchPage, { nowMs, limit = PAGE_ROWS } = {}) => {
  if (state.done) return { state, requests: 0 };
  let s = { ...state };
  let requests = 0;
  let cur = s.cursor;
  // Re-anchor at the oldest loaded row (inclusive) when there is no cursor or the page size changes.
  if (!cur || (cur.nextPage !== null && cur.limit !== limit)) {
    const ot = oldestTime(s);
    cur = { start: cur && cur.limit !== limit ? cur.start : null, end: ot === null ? nowMs : ot, limit, total: null, nextPage: null };
  }
  if (cur.nextPage !== null && cur.nextPage < 1) {
    if (cur.start === null) return { state: { ...s, cursor: null, done: true }, requests };
    cur = { start: null, end: cur.start - 1, limit, total: null, nextPage: null };
  }
  let got = [];
  if (cur.nextPage === null) {
    const o = await open(fetchPage, { start: cur.start, end: cur.end, limit });
    requests += o.reqs;
    if (o.error) return { state: s, requests, error: o.error };
    const { seg } = o;
    if (seg.lastPage === 1) {
      got = seg.firstPage.rows;
      cur = { start: seg.start, end: seg.end, limit, total: seg.total, nextPage: 0 };
    } else {
      cur = { start: seg.start, end: seg.end, limit, total: seg.total, nextPage: seg.lastPage };
    }
  }
  // Fetch the newest remaining page of the segment (plus one more if it was a small last page).
  let budget = 2;
  while (cur.nextPage >= 1 && budget > 0 && got.length < Math.ceil(limit / 2)) {
    // eslint-disable-next-line no-await-in-loop
    const r = await fetchPage({ startTime: cur.start === null ? undefined : cur.start, endTime: cur.end, page: cur.nextPage, limit });
    requests += 1;
    budget -= 1;
    if (r.error) {
      s = { ...s, items: mergeRows(s.items, got), cursor: cur };
      return { state: s, requests, error: r };
    }
    got = got.concat(r.rows);
    cur = { ...cur, nextPage: cur.nextPage - 1 };
  }
  const items = mergeRows(s.items, got);
  let done = false;
  if (cur.nextPage < 1 && cur.start === null) done = true;
  s = {
    ...s,
    items,
    newestTime: Math.max(s.newestTime || 0, items.length ? items[0].time : 0),
    cursor: done ? null : cur,
    done,
  };
  return { state: s, requests };
};

// Rows newer than the newest cached one. First load (empty state) = loadOlder from now.
export const refreshNewest = async (state, fetchPage, { nowMs, catchupMax = CATCHUP_MAX } = {}) => {
  if (!state.items.length && !state.done) return loadOlder(state, fetchPage, { nowMs, limit: PAGE_ROWS });
  const start = state.newestTime; // inclusive: rows sharing that timestamp come back and are deduped
  let requests = 0;
  const first = await fetchPage({ startTime: start, endTime: nowMs, page: 1, limit: BIG_PAGE_ROWS });
  requests += 1;
  if (first.error) return { state, requests, error: first };
  if (first.total > catchupMax) {
    // Too far behind: drop the cache and walk back from now (no gap is ever stored).
    const r = await loadOlder(emptyState(), fetchPage, { nowMs, limit: PAGE_ROWS });
    return { ...r, requests: requests + r.requests, reset: true };
  }
  let rows = first.rows;
  let page = 1;
  let more = first.hasMore;
  while (more) {
    page += 1;
    // eslint-disable-next-line no-await-in-loop
    const r = await fetchPage({ startTime: start, endTime: nowMs, page, limit: BIG_PAGE_ROWS });
    requests += 1;
    if (r.error) return { state, requests, error: r }; // keep the old state: no partial (gappy) merge
    rows = rows.concat(r.rows);
    more = r.hasMore;
  }
  const items = mergeRows(state.items, rows);
  return { state: { ...state, items, newestTime: Math.max(state.newestTime, items.length ? items[0].time : 0) }, requests };
};

// What goes to AsyncStorage: the newest `max` rows and a cursor that re-anchors at the oldest kept
// row (inclusive), so the stored range is exactly [oldest kept .. newest] — never a false "complete".
export const trimForPersist = (state, max = PERSIST_ROWS) => {
  if (state.items.length <= max) return state;
  const items = state.items.slice(0, max);
  return { items, newestTime: state.newestTime, cursor: null, done: false };
};
