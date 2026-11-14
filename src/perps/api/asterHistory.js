// Read-only account history (agent-signed GETs via asterSignedRequest; never logs keys/signatures).
// Backbone: GET /fapi/v3/incomePage — one call covers ALL symbols, no limit on the time span
// (page × limit ≤ 100k), rows sorted by time ascending. Weight 30.
// Details on tap: GET /fapi/v3/userTrades for ONE symbol and a short window (≤ 7 days). Weight 5.
// Transfers: POST /fapi/v3/aster/deposit-withdraw-history (tx hash + state per deposit/withdraw).
import { asterSignedRequest } from "./asterSigned";

export const INCOME_PAGE_LIMIT = 1000;

// { rows, hasMore, total } | { error, code, agentInvalid }
export const fetchIncomePage = async (agent, user, { startTime, endTime, page = 1 }) => {
  const res = await asterSignedRequest({
    agent,
    user,
    method: "GET",
    path: "/fapi/v3/incomePage",
    params: { startTime, endTime, page, limit: INCOME_PAGE_LIMIT },
  });
  if (res.error) return { error: res.error, code: res.code, agentInvalid: res.agentInvalid };
  const d = res.data || {};
  return { rows: Array.isArray(d.rows) ? d.rows : [], hasMore: !!d.hasMore, total: Number(d.total) || 0 };
};

// All income rows in [startTime, endTime] (pages until done, max 5 pages = 5000 rows).
export const fetchIncomeRange = async (agent, user, startTime, endTime) => {
  const rows = [];
  let requests = 0;
  for (let page = 1; page <= 5; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await fetchIncomePage(agent, user, { startTime, endTime, page });
    requests += 1;
    if (r.error) return { ...r, requests };
    rows.push(...r.rows);
    if (!r.hasMore) break;
  }
  return { rows, requests };
};

// Fills for one symbol around a time (details on tap). Window is clamped to the 7-day API limit.
export const fetchTradesAround = async (agent, user, symbol, time, padMs = 60 * 1000) => {
  const res = await asterSignedRequest({
    agent,
    user,
    method: "GET",
    path: "/fapi/v3/userTrades",
    params: { symbol, startTime: Math.max(0, time - padMs), endTime: time + padMs, limit: 100 },
  });
  if (res.error) return { error: res.error, code: res.code, agentInvalid: res.agentInvalid };
  return { data: Array.isArray(res.data) ? res.data : [] };
};

// Deposits + withdrawals with on-chain tx hash and state, newest first.
export const fetchTransferHistory = async (agent, user) => {
  const res = await asterSignedRequest({ agent, user, method: "POST", path: "/fapi/v3/aster/deposit-withdraw-history" });
  if (res.error) return { error: res.error, code: res.code, agentInvalid: res.agentInvalid };
  const rows = (Array.isArray(res.data) ? res.data : [])
    .filter((r) => r && (r.type === "DEPOSIT" || r.type === "WITHDRAW"))
    .sort((a, b) => Number(b.time) - Number(a.time));
  return { data: rows };
};
