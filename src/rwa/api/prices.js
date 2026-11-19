// DefiLlama prices (public, no key): current price + 24h change (batched, cached 60s) and history.
import { LLAMA_API } from "../config";

const TTL_MS = 60000;
const BATCH = 40;
const cache = new Map(); // key -> { price, change24h, at }
const inflight = new Map(); // key -> promise

const getJson = async (url) => {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
  try {
    const r = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const getCachedPrice = (key) => {
  const c = key && cache.get(key);
  return c || null;
};

const fetchBatch = async (keys) => {
  const joined = keys.join(",");
  const [cur, pct] = await Promise.all([
    getJson(`${LLAMA_API}/prices/current/${joined}`).catch(() => null),
    getJson(`${LLAMA_API}/percentage/${joined}?period=24h`).catch(() => null),
  ]);
  const at = Date.now();
  keys.forEach((k) => {
    const p = cur && cur.coins && cur.coins[k];
    const ch = pct && pct.coins ? pct.coins[k] : undefined;
    cache.set(k, {
      price: p && Number.isFinite(Number(p.price)) ? Number(p.price) : null,
      change24h: Number.isFinite(Number(ch)) ? Number(ch) : null,
      at,
    });
  });
};

// Make sure prices for these keys are fresh. Resolves when done (errors are swallowed: price = null).
export const loadPrices = async (keys) => {
  const now = Date.now();
  const need = Array.from(new Set(keys.filter(Boolean))).filter((k) => {
    const c = cache.get(k);
    return (!c || now - c.at > TTL_MS) && !inflight.has(k);
  });
  const waits = keys.filter((k) => inflight.has(k)).map((k) => inflight.get(k));
  for (let i = 0; i < need.length; i += BATCH) {
    const chunk = need.slice(i, i + BATCH);
    const p = fetchBatch(chunk).finally(() => chunk.forEach((k) => inflight.delete(k)));
    chunk.forEach((k) => inflight.set(k, p));
    waits.push(p);
  }
  await Promise.all(waits.map((p) => p.catch(() => null)));
};

// History for the chart: range "1D" | "1W" | "1M" -> [{ t, c, h, l }] (PriceChart shape).
const RANGES = { "1D": { span: 24, period: "1h" }, "1W": { span: 42, period: "4h" }, "1M": { span: 30, period: "1d" } };
const chartCache = new Map();

export const loadHistory = async (key, range = "1M") => {
  const r = RANGES[range] || RANGES["1M"];
  const ck = `${key}|${range}`;
  const c = chartCache.get(ck);
  if (c && Date.now() - c.at < 5 * 60000) return c.data;
  const json = await getJson(`${LLAMA_API}/chart/${key}?span=${r.span}&period=${r.period}`);
  const prices = (json && json.coins && json.coins[key] && json.coins[key].prices) || [];
  const data = prices
    .filter((p) => Number.isFinite(Number(p.price)))
    .map((p) => ({ t: p.timestamp * 1000, c: Number(p.price), h: Number(p.price), l: Number(p.price) }));
  chartCache.set(ck, { at: Date.now(), data });
  return data;
};

export const __test = { reset: () => { cache.clear(); chartCache.clear(); inflight.clear(); } };
