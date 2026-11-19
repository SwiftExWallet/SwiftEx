// xStocks market status from the public xStocks API (no key), per symbol, cached 5 min.
// xStocks include non-US stocks (e.g. Euronext), so the US calendar alone is not enough.
import { XSTOCKS_API } from "../config";
import { xstocksStatus } from "../utils/marketHours";

const TTL_MS = 5 * 60000;
const cache = new Map(); // symbol -> { status, at }
const inflight = new Map();

export const getCachedXStatus = (symbol) => {
  const c = cache.get(symbol);
  return c && Date.now() - c.at < TTL_MS ? c.status : null;
};

const fetchOne = async (symbol) => {
  try {
    const r = await fetch(`${XSTOCKS_API}/assets/${encodeURIComponent(symbol)}`);
    const j = r.ok ? await r.json() : null;
    cache.set(symbol, { status: j ? xstocksStatus(j.trading) : null, at: Date.now() });
  } catch (e) {
    cache.set(symbol, { status: null, at: Date.now() - TTL_MS + 60000 }); // retry in ~1 min
  }
};

// Load statuses for these symbols (max 4 requests at a time). Resolves when done.
export const loadXStatuses = async (symbols) => {
  const need = Array.from(new Set(symbols)).filter((s) => s && !getCachedXStatus(s) && !inflight.has(s));
  for (let i = 0; i < need.length; i += 4) {
    const part = need.slice(i, i + 4);
    const ps = part.map((s) => {
      const p = fetchOne(s).finally(() => inflight.delete(s));
      inflight.set(s, p);
      return p;
    });
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(ps);
  }
};
