// Aster public (no-auth) REST helpers. Read-only market data. Every helper resolves to
// { data, error } and never throws.
export const ASTER_REST_BASE = "https://fapi.asterdex.com";

const DEFAULT_TIMEOUT_MS = 15000;

const friendlyError = (err) => {
  if (!err) return "Something went wrong";
  if (err.name === "AbortError" || err.message === "timeout") {
    return "Request timed out. Check your connection.";
  }
  if (/network request failed/i.test(err.message || "")) {
    return "Network error. Check your connection.";
  }
  return err.message || "Something went wrong";
};

// Generic Aster HTTP call. Resolves to { data, error, code } and never throws.
// `code` is Aster's numeric error code when the body has one (code < 0 means error).
export const asterFetch = async (
  path,
  { method = "GET", body, headers, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) => {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (controller) controller.abort();
        reject(new Error("timeout"));
      }, timeoutMs);
    });
    const url = /^https:\/\//.test(path) ? path : `${ASTER_REST_BASE}${path}`;
    const request = fetch(url, {
      method,
      headers: { Accept: "application/json", ...(headers || {}) },
      body,
      signal: controller ? controller.signal : undefined,
    });
    const response = await Promise.race([request, timeout]);
    const data = await response.json().catch(() => null);
    const code = data && typeof data.code === "number" ? data.code : null;
    if (!response.ok || (code !== null && code < 0)) {
      const msg = data && data.msg ? data.msg : `HTTP ${response.status}`;
      return { data, error: msg, code };
    }
    return { data, error: null, code };
  } catch (err) {
    return { data: null, error: friendlyError(err), code: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// Public (no-auth) GET. Longer timeout than signed calls (slow DNS on first request + large
// exchangeInfo), and one silent retry with a short backoff when there was no usable answer
// (timeout, network error, or an HTTP error without a JSON body). Aster error codes are not retried.
export const PUBLIC_TIMEOUT_MS = 30000;
const PUBLIC_RETRY_DELAY_MS = 1500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const asterGet = async (path, opts) => {
  const { retries = 1, ...rest } = opts || {};
  const fetchOpts = { timeoutMs: PUBLIC_TIMEOUT_MS, ...rest, method: "GET" };
  let res = await asterFetch(path, fetchOpts);
  for (let i = 0; i < retries && res.error && res.data === null && res.code === null; i += 1) {
    await sleep(PUBLIC_RETRY_DELAY_MS * (i + 1));
    res = await asterFetch(path, fetchOpts);
  }
  return { data: res.error ? null : res.data, error: res.error };
};

const filterValue = (filters, type, key) => {
  const f = (filters || []).find((x) => x.filterType === type);
  return f ? f[key] : undefined;
};

// Symbol metadata (tick/step sizes, min notional) kept in memory for order entry.
// `marketMetaFetchedAt` is when exchangeInfo was fetched from Aster (a saved copy keeps its
// original time), so orders can insist on fresh rules.
let marketMetaCache = null;
let marketMetaFetchedAt = 0;
export const getCachedMarketMeta = () => marketMetaCache;

const indexBySymbol = (markets) =>
  markets.reduce((acc, m) => {
    acc[m.symbol] = m;
    return acc;
  }, {});

// Seed the in-memory rules from the saved market list (only if nothing fresher is loaded).
export const primeMarketMeta = (markets, fetchedAt) => {
  if (!Array.isArray(markets) || !markets.length) return;
  if (marketMetaCache && marketMetaFetchedAt >= fetchedAt) return;
  marketMetaCache = indexBySymbol(markets);
  marketMetaFetchedAt = Number(fetchedAt) || 0;
};

export const getMarketMetaFetchedAt = () => marketMetaFetchedAt;

// Fields that decide whether an order is valid. If any changed, the user must re-confirm.
export const ORDER_RULE_FIELDS = [
  "tickSize",
  "stepSize",
  "minQty",
  "marketStepSize",
  "minNotional",
  "priceBandDown",
  "priceBandUp",
];

// Make sure the trading rules are at most `maxAgeMs` old (refetch exchangeInfo otherwise).
// -> { ok, refreshed, error }
export const ensureFreshMarketMeta = async (maxAgeMs) => {
  if (marketMetaCache && Date.now() - marketMetaFetchedAt <= maxAgeMs) {
    return { ok: true, refreshed: false, error: null };
  }
  const { error } = await fetchPerpMarkets();
  return error ? { ok: false, refreshed: false, error } : { ok: true, refreshed: true, error: null };
};

// GET /fapi/v3/exchangeInfo -> tradable perpetual markets (PERPETUAL AND TRADING AND quoted in USDT).
export const fetchPerpMarkets = async () => {
  const { data, error } = await asterGet("/fapi/v3/exchangeInfo");
  if (error) return { data: null, error };
  const symbols = Array.isArray(data?.symbols) ? data.symbols : [];
  const markets = symbols
    .filter(
      (s) => s.contractType === "PERPETUAL" && s.status === "TRADING" && s.quoteAsset === "USDT"
    )
    .map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      pricePrecision: s.pricePrecision,
      quantityPrecision: s.quantityPrecision,
      tickSize: filterValue(s.filters, "PRICE_FILTER", "tickSize"),
      stepSize: filterValue(s.filters, "LOT_SIZE", "stepSize"),
      minQty: filterValue(s.filters, "LOT_SIZE", "minQty"),
      marketStepSize: filterValue(s.filters, "MARKET_LOT_SIZE", "stepSize"),
      minNotional: filterValue(s.filters, "MIN_NOTIONAL", "notional"),
      // Limit prices must stay within mark × [multiplierDown, multiplierUp]
      priceBandDown: filterValue(s.filters, "PERCENT_PRICE", "multiplierDown"),
      priceBandUp: filterValue(s.filters, "PERCENT_PRICE", "multiplierUp"),
      maxLeverage: null, // filled from signed leverageBrackets once trading is enabled
    }));
  marketMetaCache = indexBySymbol(markets);
  marketMetaFetchedAt = Date.now();
  return { data: markets, error: null };
};

const mapTicker = (t) => ({
  symbol: t.symbol,
  lastPrice: Number(t.lastPrice),
  priceChangePercent: Number(t.priceChangePercent),
  quoteVolume: Number(t.quoteVolume),
  highPrice: Number(t.highPrice),
  lowPrice: Number(t.lowPrice),
});

// GET /fapi/v1/ticker/24hr (all symbols, or one when `symbol` is given)
export const fetchTickers24h = async (symbol) => {
  const path = symbol
    ? `/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`
    : "/fapi/v1/ticker/24hr";
  const { data, error } = await asterGet(path);
  if (error) return { data: null, error };
  if (symbol) return { data: data ? mapTicker(data) : null, error: null };
  return { data: Array.isArray(data) ? data.map(mapTicker) : [], error: null };
};

export const KLINE_INTERVALS = ["15m", "1h", "4h", "1d"];

// GET /fapi/v3/klines -> [{ t, o, h, l, c, v }]
export const fetchKlines = async (symbol, interval, limit = 200) => {
  const { data, error } = await asterGet(
    `/fapi/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
  );
  if (error) return { data: null, error };
  const candles = (Array.isArray(data) ? data : []).map((k) => ({
    t: Number(k[0]),
    o: Number(k[1]),
    h: Number(k[2]),
    l: Number(k[3]),
    c: Number(k[4]),
    v: Number(k[5]),
  }));
  return { data: candles, error: null };
};

// GET /fapi/v3/time -> { serverTime } (ms)
export const fetchServerTime = async () => {
  // Used right before signing: keep it short and let the signed flow handle failures.
  const { data, error } = await asterGet("/fapi/v3/time", { timeoutMs: 10000, retries: 0 });
  if (error || !Number.isFinite(Number(data?.serverTime))) {
    return { data: null, error: error || "Bad server time" };
  }
  return { data: Number(data.serverTime), error: null };
};

// GET /fapi/v3/premiumIndex?symbol= -> mark price, last funding rate, next funding time
export const fetchPremiumIndex = async (symbol) => {
  const { data, error } = await asterGet(
    `/fapi/v3/premiumIndex?symbol=${encodeURIComponent(symbol)}`
  );
  if (error) return { data: null, error };
  return {
    data: {
      markPrice: Number(data?.markPrice),
      fundingRate: Number(data?.lastFundingRate),
      nextFundingTime: Number(data?.nextFundingTime),
    },
    error: null,
  };
};
