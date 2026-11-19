// One row per asset, Popular/US first, chips, search; quote figures; gas text.
const { RWA_ASSETS } = require("../data/assets");
const { buildGroups, partitionGroups, listRows, getAllGroups, groupByKey, POPULAR, tickerOf } = require("../data/groups");
const { quoteFigures, smallEthOrder, defaultChain } = require("../utils/quoteMath");
const { fmtSig, nativeCostText } = require("../utils/amounts");
const { visibleAssets } = require("../regions");

const groups = getAllGroups();
const parts = partitionGroups(groups);

test("same issuer + symbol on ETH and BNB is one group with both chains", () => {
  const g = groupByKey("xstocks|AAPLx");
  expect(g.chains).toEqual(["ETH", "BSC"]);
  expect(g.byChain.ETH.address).toBe(g.byChain.BSC.address); // xStocks: same address on every EVM chain
  const o = groupByKey("ondo|AAPLon");
  expect(o.chains).toEqual(["ETH", "BSC"]);
  expect(o.byChain.ETH.address).not.toBe(o.byChain.BSC.address);
  expect(o.primary.chain).toBe("ETH");
  expect(groups.length).toBeLessThan(RWA_ASSETS.length);
});

test("Popular first in the curated order; Ondo and xStocks of a ticker side by side", () => {
  const tickers = parts.popular.map((g) => tickerOf(g).toUpperCase());
  const order = POPULAR.map((p) => p.toUpperCase()).filter((p) => tickers.includes(p));
  expect(Array.from(new Set(tickers))).toEqual(order);
  const aapl = parts.popular.filter((g) => tickerOf(g) === "AAPL").map((g) => g.issuer);
  expect(aapl).toEqual(["ondo", "xstocks"]);
});

test("default view: US only, a few hundred rows; non-US behind Other markets", () => {
  const rows = listRows(parts, { chip: "all" });
  const assets = rows.filter((r) => r.type === "asset").map((r) => r.group);
  expect(assets.length).toBeGreaterThan(200);
  expect(assets.length).toBeLessThan(900);
  expect(assets.every((g) => g.market === "US" || g.market === null)).toBe(true);
  expect(rows[0]).toMatchObject({ type: "header", title: "Popular" });
  const other = listRows(parts, { chip: "other" }).map((r) => r.group);
  expect(other.length).toBeGreaterThan(0);
  expect(other.every((g) => g.market !== "US")).toBe(true);
  expect(other.some((g) => g.symbol === "A5Gx")).toBe(true); // AIB, Euronext Dublin
});

test("search covers every market", () => {
  const r = listRows(parts, { chip: "all", query: "aib" }).map((x) => x.group.symbol);
  expect(r).toContain("A5Gx");
  expect(listRows(parts, { chip: "all", query: "aapl" }).length).toBeGreaterThanOrEqual(2);
});

test("category chips filter the default segment", () => {
  const etfs = listRows(parts, { chip: "etf" }).map((r) => r.group);
  expect(etfs.length).toBeGreaterThan(0);
  expect(etfs.every((g) => g.category === "etf")).toBe(true);
  expect(listRows(parts, { chip: "gold" }).map((r) => r.group.symbol).sort()).toEqual(["PAXG", "XAUt"]);
});

test("region filtering still per asset (IN sees all, GB only gold + CETES)", () => {
  expect(buildGroups(visibleAssets(RWA_ASSETS, "IN")).length).toBe(groups.length);
  expect(buildGroups(visibleAssets(RWA_ASSETS, "GB")).map((g) => g.symbol).sort()).toEqual(["CETES", "PAXG", "XAUt"]);
});

test("quote figures: fee %, effective price vs market (numbers from the 2026-11-19 AAPLon ETH quote)", () => {
  const f = quoteFigures({ side: "buy", amountIn: "25", out: "0.070261", fee: "0.001232", marketPrice: 354.69 });
  expect(f.feePct).toBeCloseTo(1.72, 2);
  expect(f.effectivePrice).toBeCloseTo(355.82, 1);
  expect(f.vsMarketPct).toBeCloseTo(0.32, 1);
  const s = quoteFigures({ side: "sell", amountIn: "1", out: "350", fee: "1", marketPrice: 355 });
  expect(s.effectivePrice).toBe(350);
  expect(s.vsMarketPct).toBeCloseTo(1.41, 1);
  expect(quoteFigures({ side: "buy", amountIn: "", out: null }).feePct).toBeNull();
});

test("Ethereum small-order hint and default chain", () => {
  expect(smallEthOrder("ETH", 25)).toBe(true);
  expect(smallEthOrder("ETH", 5000)).toBe(false);
  expect(smallEthOrder("BSC", 25)).toBe(false);
  expect(defaultChain(["ETH", "BSC"], { ETH: 0, BSC: 0 })).toBe("BSC");
  expect(defaultChain(["ETH", "BSC"], { ETH: 50, BSC: 6.67 })).toBe("ETH");
  expect(defaultChain(["ETH"], {})).toBe("ETH");
});

test("gas text: significant digits + USD, never 0 for a non-zero cost", () => {
  expect(fmtSig(0.0000412)).toBe("0.000041");
  expect(fmtSig(0.00000000123)).toBe("0.0000000012");
  expect(fmtSig(0)).toBe("0");
  expect(fmtSig(1.23456789)).toBe("1.2346");
  expect(nativeCostText("41000000000000", "BNB", 580)).toBe("≈0.000041 BNB (~$0.02)");
  expect(nativeCostText("1000000000", "BNB", 580)).toBe("≈0.000000001 BNB (<$0.01)");
  expect(nativeCostText("41000000000000", "ETH", null)).toBe("≈0.000041 ETH");
});
