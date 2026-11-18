// One row per asset: the same issuer + symbol on several chains is one group (chain chosen on Buy).
// Default ordering: Popular first, then US stocks/ETFs in Ondo's universe (major US names) A–Z with
// the Ondo and xStocks versions of the same ticker next to each other. The long tail of US xStocks
// is under "More US", non-US listings under "Other markets". Search covers everything.

import { RWA_ASSETS } from "./assets";

let allGroups = null;
// All groups of the bundled list (built once). Region filtering is done by the screens.
export const getAllGroups = () => {
  if (!allGroups) allGroups = buildGroups(RWA_ASSETS);
  return allGroups;
};
export const groupByKey = (key) => getAllGroups().find((g) => g.key === key) || null;

export const POPULAR = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "SPY", "QQQ", "COIN", "MSTR", "PAXG", "XAUt", "USDY"];
const ISSUER_ORDER = { ondo: 0, xstocks: 1, paxos: 2, tether: 3, "ondo-stellar": 4, etherfuse: 5 };
const CHAIN_ORDER = { ETH: 0, BSC: 1, XLM: 2 };

export const groupKey = (a) => `${a.issuer}|${a.symbol}`;

// Ticker used for ordering / popular matching: underlying for stocks, own symbol for gold/treasuries.
export const tickerOf = (g) => (g.category === "stock" || g.category === "etf" ? g.underlying || g.symbol : g.symbol);

export const buildGroups = (assets) => {
  const map = new Map();
  assets.forEach((a) => {
    const k = groupKey(a);
    if (!map.has(k)) {
      map.set(k, {
        key: k,
        symbol: a.symbol,
        name: a.name,
        underlying: a.underlying,
        issuer: a.issuer,
        category: a.category,
        market: a.market || null,
        logo: a.logo,
        marketHours: a.marketHours,
        termsUrl: a.termsUrl,
        regions: a.regions,
        multiplier: a.multiplier,
        chains: [],
        byChain: {},
      });
    }
    const g = map.get(k);
    if (!g.byChain[a.chain]) {
      g.byChain[a.chain] = a;
      g.chains.push(a.chain);
    }
    if (!g.logo && a.logo) g.logo = a.logo;
  });
  const out = Array.from(map.values());
  out.forEach((g) => {
    g.chains.sort((x, y) => CHAIN_ORDER[x] - CHAIN_ORDER[y]);
    g.primary = g.byChain[g.chains[0]]; // ETH first (price key / multiplier / Stellar)
  });
  return out;
};

const cmpTicker = (a, b) =>
  tickerOf(a).toUpperCase().localeCompare(tickerOf(b).toUpperCase()) || ISSUER_ORDER[a.issuer] - ISSUER_ORDER[b.issuer];

// Partition into { popular, core, moreUs, other, nonSecurity } (each sorted).
export const partitionGroups = (groups) => {
  const ondoTickers = new Set(groups.filter((g) => g.issuer === "ondo").map((g) => String(tickerOf(g)).toUpperCase()));
  const popularSet = new Set(POPULAR.map((t) => t.toUpperCase()));
  const popular = [];
  const core = [];
  const moreUs = [];
  const other = [];
  const nonSecurity = []; // gold / treasuries that aren't in Popular
  groups.forEach((g) => {
    const t = String(tickerOf(g)).toUpperCase();
    if (popularSet.has(t)) popular.push(g);
    else if (g.category === "gold" || g.category === "treasury") nonSecurity.push(g);
    else if (g.market !== "US") other.push(g);
    else if (ondoTickers.has(t)) core.push(g);
    else moreUs.push(g);
  });
  const popIdx = (g) => POPULAR.findIndex((p) => p.toUpperCase() === String(tickerOf(g)).toUpperCase());
  popular.sort((a, b) => popIdx(a) - popIdx(b) || ISSUER_ORDER[a.issuer] - ISSUER_ORDER[b.issuer]);
  [core, moreUs, nonSecurity].forEach((l) => l.sort(cmpTicker));
  // Non-US tickers are often numbers (HKEX "0001"): sort that segment by token symbol instead.
  other.sort((a, b) => a.symbol.toUpperCase().localeCompare(b.symbol.toUpperCase()) || ISSUER_ORDER[a.issuer] - ISSUER_ORDER[b.issuer]);
  return { popular, core, moreUs, other, nonSecurity };
};

export const CHIP_LABELS = {
  all: "All",
  stock: "Stocks",
  etf: "ETFs",
  gold: "Gold",
  treasury: "Treasuries",
  moreus: "More US",
  other: "Other markets",
};
export const CHIPS = ["all", "stock", "etf", "gold", "treasury", "moreus", "other"];

const matches = (g, q) =>
  g.symbol.toLowerCase().includes(q) || g.name.toLowerCase().includes(q) || String(g.underlying || "").toLowerCase().includes(q);

// Rows for the list: [{ type: "header", title } | { type: "asset", group }].
// Without a search: chip decides. With a search: everything that matches (chip still filters by
// category for Stocks / ETFs / Gold / Treasuries; More US / Other markets limit to that segment).
export const listRows = (parts, { chip = "all", query = "" } = {}) => {
  const q = query.trim().toLowerCase();
  const rows = [];
  const push = (title, list) => {
    if (!list.length) return;
    if (title) rows.push({ type: "header", key: `h:${title}`, title });
    list.forEach((g) => rows.push({ type: "asset", key: g.key, group: g }));
  };
  const everything = [...parts.popular, ...parts.core, ...parts.nonSecurity, ...parts.moreUs, ...parts.other];
  if (q) {
    let pool = everything;
    if (chip === "moreus") pool = parts.moreUs;
    else if (chip === "other") pool = parts.other;
    else if (chip !== "all") pool = everything.filter((g) => g.category === chip);
    push(null, pool.filter((g) => matches(g, q)));
    return rows;
  }
  if (chip === "all") {
    push("Popular", parts.popular);
    push("US stocks & ETFs", parts.core);
    push("Gold & treasuries", parts.nonSecurity);
    return rows;
  }
  if (chip === "moreus") {
    push(null, parts.moreUs);
    return rows;
  }
  if (chip === "other") {
    push(null, parts.other);
    return rows;
  }
  // Category chips: the default (popular + core + gold/treasuries) segment of that category.
  push(null, [...parts.popular, ...parts.core, ...parts.nonSecurity].filter((g) => g.category === chip));
  return rows;
};
