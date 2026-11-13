// History paging over a mocked incomePage (Aster semantics: time ASC, page×limit ≤ 100k, total).
// Heavy accounts with same-timestamp bursts: no gaps, no duplicates, exact period totals.
import * as P from "../utils/historyPaging";

let failures = [];
const ok = (cond, msg) => {
  if (!cond) failures.push(msg);
};

// Deterministic data: n rows over `days`, bursts of up to 9 rows on the same millisecond.
const makeRows = (n, nowMs, days, seed = 1) => {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rows = [];
  let t = nowMs - days * 864e5;
  const types = ["REALIZED_PNL", "COMMISSION", "FUNDING_FEE"];
  for (let i = 0; i < n; ) {
    const burst = 1 + Math.floor(rnd() * 9);
    for (let b = 0; b < burst && i < n; b += 1, i += 1) {
      rows.push({ symbol: "BTCUSDT", incomeType: types[i % 3], income: ((i % 7) - 3) / 100 + "", asset: "USDT", time: t, tranId: 100000 + i, tradeId: "" });
    }
    t += Math.floor((days * 864e5) / (n / 5)) * rnd();
  }
  return rows;
};

// Server mock: time ASC, tie order by tranId (stable); inclusive start/end; page×limit ≤ 100k.
const makeServer = (all) => {
  const srv = { all, calls: 0 };
  srv.fetchPage = async ({ startTime, endTime, page, limit }) => {
    srv.calls += 1;
    if (page * limit > 100000) return { error: "page*limit too large", code: -1130 };
    const rows = srv.all
      .filter((r) => (startTime === undefined || r.time >= startTime) && r.time <= endTime)
      .sort((a, b) => a.time - b.time || a.tranId - b.tranId);
    const slice = rows.slice((page - 1) * limit, page * limit);
    return { rows: slice, total: rows.length, hasMore: page * limit < rows.length };
  };
  return srv;
};

const walkAll = async (srv, nowMs, state = P.emptyState(), limit = P.PAGE_ROWS) => {
  let s = state;
  let guard = 0;
  while (!s.done && guard < 2000) {
    // eslint-disable-next-line no-await-in-loop
    const r = await P.loadOlder(s, srv.fetchPage, { nowMs, limit });
    if (r.error) throw new Error(JSON.stringify(r.error));
    s = r.state;
    guard += 1;
  }
  return s;
};

const sameSet = (items, all) => {
  const a = new Set(items.map((i) => i.k));
  return a.size === items.length && a.size === all.length && all.every((r) => a.has(`${r.incomeType}:${r.tranId}`));
};

const NOW = 1794580000000;

test("history paging (mock incomePage)", async () => {
// 1. Light account: one request on first open, complete.
{
  const srv = makeServer(makeRows(27, NOW, 1));
  const r = await P.refreshNewest(P.emptyState(), srv.fetchPage, { nowMs: NOW });
  ok(r.requests === 1, `light first open requests=${r.requests}`);
  ok(r.state.done && sameSet(r.state.items, srv.all), "light complete");
  const again = await P.refreshNewest(r.state, srv.fetchPage, { nowMs: NOW + 1000 });
  ok(again.requests === 1 && again.state.items.length === 27, `light cached open requests=${again.requests}`);
}

// 2. Heavy: 12,000 rows with same-timestamp bursts -> no gaps, no duplicates.
{
  const srv = makeServer(makeRows(12000, NOW, 90, 7));
  const first = await P.refreshNewest(P.emptyState(), srv.fetchPage, { nowMs: NOW });
  ok(first.requests === 2 && first.state.items.length === 200, `heavy first page requests=${first.requests} rows=${first.state.items.length}`);
  const newest200 = [...srv.all].sort((a, b) => b.time - a.time || b.tranId - a.tranId).slice(0, 200);
  ok(newest200.every((r) => first.state.items.some((i) => i.k === `${r.incomeType}:${r.tranId}`)), "heavy first page = newest 200");
  srv.calls = 0;
  const s = await walkAll(srv, NOW, first.state);
  ok(sameSet(s.items, srv.all), `heavy walk complete (${s.items.length}/12000)`);
  ok(srv.calls <= 61, `heavy walk requests=${srv.calls}`);
  // covered range always contiguous: at each step every row with time >= coveredFrom is loaded
  let st = P.emptyState();
  let contiguous = true;
  for (let i = 0; i < 70 && !st.done; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    st = (await P.loadOlder(st, srv.fetchPage, { nowMs: NOW })).state;
    const cf = P.coveredFrom(st);
    const keys = new Set(st.items.map((x) => x.k));
    if (!srv.all.filter((r) => r.time >= cf).every((r) => keys.has(`${r.incomeType}:${r.tranId}`))) contiguous = false;
  }
  ok(contiguous, "coveredFrom never over-claims (same-timestamp rows)");
}

// 3. Summary for a period equals the truth once covered.
{
  const srv = makeServer(makeRows(12000, NOW, 90, 3));
  let s = P.emptyState();
  const periodStart = NOW - 30 * 864e5;
  let req = 0;
  while (!(P.coveredFrom(s) !== null && P.coveredFrom(s) <= periodStart) && !s.done) {
    // eslint-disable-next-line no-await-in-loop
    const r = await P.loadOlder(s, srv.fetchPage, { nowMs: NOW, limit: P.BIG_PAGE_ROWS });
    s = r.state;
    req += r.requests;
  }
  const sum = (rows) => rows.filter((r) => r.time >= periodStart && (r.incomeType || r.type) === "REALIZED_PNL").reduce((a, r) => a + Number(r.income), 0);
  ok(Math.abs(sum(s.items) - sum(srv.all)) < 1e-9, `30D summary matches truth (requests=${req})`);
}

// 4. Trim for persistence keeps an honest range; resuming fills the rest without gaps.
{
  const srv = makeServer(makeRows(5000, NOW, 30, 11));
  let s = P.emptyState();
  for (let i = 0; i < 16; i += 1) s = (await P.loadOlder(s, srv.fetchPage, { nowMs: NOW })).state; // ~3200 rows
  const t = P.trimForPersist(s, 2000);
  ok(t.items.length === 2000 && t.cursor === null && !t.done, "trimmed to 2000, cursor reset");
  const cf = P.coveredFrom(t);
  const keys = new Set(t.items.map((x) => x.k));
  ok(srv.all.filter((r) => r.time >= cf).every((r) => keys.has(`${r.incomeType}:${r.tranId}`)), "trimmed range has no hole");
  const full = await walkAll(srv, NOW, t);
  ok(sameSet(full.items, srv.all), "resume after trim -> complete, no duplicates");
}

// 5. Catch-up: few new rows (incl. same timestamp as newest) merge; many new rows reset.
{
  const base = makeRows(3000, NOW, 30, 5);
  const srv = makeServer(base.slice());
  const s = await walkAll(srv, NOW);
  const newest = s.newestTime;
  srv.all.push({ symbol: "BTCUSDT", incomeType: "COMMISSION", income: "-0.01", asset: "USDT", time: newest, tranId: 999001 });
  for (let i = 0; i < 40; i += 1) srv.all.push({ symbol: "ETHUSDT", incomeType: "REALIZED_PNL", income: "0.02", asset: "USDT", time: newest + 1000 + i, tranId: 999100 + i });
  const r = await P.refreshNewest(s, srv.fetchPage, { nowMs: NOW + 864e5 });
  ok(r.requests === 1 && sameSet(r.state.items, srv.all), `catch-up merges (requests=${r.requests}, rows=${r.state.items.length})`);
  for (let i = 0; i < 2500; i += 1) srv.all.push({ symbol: "SOLUSDT", incomeType: "COMMISSION", income: "-0.001", asset: "USDT", time: newest + 100000 + i, tranId: 800000 + i });
  const r2 = await P.refreshNewest(r.state, srv.fetchPage, { nowMs: NOW + 2 * 864e5 });
  const newestKeys = [...srv.all].sort((a, b) => b.time - a.time || b.tranId - a.tranId).slice(0, r2.state.items.length).map((r) => `${r.incomeType}:${r.tranId}`);
  ok(r2.reset === true && r2.state.items.length >= 100 && !r2.state.done && newestKeys.every((k) => r2.state.items.some((i) => i.k === k)), `big catch-up resets to newest rows (${r2.state.items.length})`);
  const full = await walkAll(srv, NOW + 2 * 864e5, r2.state);
  ok(sameSet(full.items, srv.all), `after reset, walking back is complete (${full.items.length}/${srv.all.length}, unique ${new Set(full.items.map((i) => i.k)).size})`);
}

// 6. > 100k rows: page×limit rule forces narrower windows; still complete.
{
  const srv = makeServer(makeRows(120000, NOW, 60, 9));
  const s = await walkAll(srv, NOW, P.emptyState(), P.BIG_PAGE_ROWS);
  ok(sameSet(s.items, srv.all), `120k rows complete (${s.items.length})`);
}

  expect(failures).toEqual([]);
}, 120000);
