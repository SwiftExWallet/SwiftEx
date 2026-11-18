// The bundled curated list: every entry valid, unique, pinned issuers for Stellar, filters work.
const { RWA_ASSETS, validateAssets, assetProblem, filterAssets, llamaKey, expandAssets } = require("../data/assets");
const { compact } = require("../scripts/buildRwaAssets");
const RAW = require("../data/rwaAssets.json");

const raw = expandAssets(RAW);

test("compact format round-trips (compact -> expand gives the same entries)", () => {
  const full = raw.map((a) => ({ ...a, multiplier: { ...a.multiplier } }));
  const again = expandAssets(compact(full));
  const byId = (l) => Object.fromEntries(l.map((a) => [a.id, a]));
  expect(byId(again)).toEqual(byId(full));
  expect(again.length).toBe(full.length);
});

test("bundled file is compact and small", () => {
  expect(Array.isArray(RAW)).toBe(false);
  expect(JSON.stringify(RAW).length).toBeLessThan(400 * 1024);
});

test("source logo error fixed: AALon uses its own Ondo logo (CSV pointed at abton_…)", () => {
  const aal = RWA_ASSETS.find((a) => a.symbol === "AALon");
  expect(aal.logo).toBe("https://cdn.ondo.finance/tokens/logos/aalon_160x160.png");
});

test("every asset has a market field; Ondo = US; gold/treasuries = null", () => {
  expect(RWA_ASSETS.filter((a) => a.issuer === "ondo").every((a) => a.market === "US")).toBe(true);
  expect(RWA_ASSETS.filter((a) => a.category === "gold" || a.category === "treasury").every((a) => a.market === null)).toBe(true);
  expect(RWA_ASSETS.find((a) => a.symbol === "A5Gx").market).toBe("IE");
  expect(RWA_ASSETS.find((a) => a.symbol === "PAXG").logo).toMatch(/^https:\/\/raw\.githubusercontent\.com\/trustwallet\//);
});

test("bundled list: nothing dropped by validation, ids unique", () => {
  const { ok, dropped } = validateAssets(raw);
  expect(dropped).toEqual([]);
  expect(ok.length).toBe(raw.length);
  expect(new Set(ok.map((a) => a.id)).size).toBe(ok.length);
  expect(RWA_ASSETS.length).toBeGreaterThan(50);
});

test("every issuer and category is present", () => {
  const issuers = new Set(RWA_ASSETS.map((a) => a.issuer));
  ["ondo", "xstocks", "paxos", "tether", "ondo-stellar", "etherfuse"].forEach((i) => expect(issuers.has(i)).toBe(true));
  const cats = new Set(RWA_ASSETS.map((a) => a.category));
  ["stock", "etf", "gold", "treasury"].forEach((c) => expect(cats.has(c)).toBe(true));
});

test("gold + Stellar entries are the pinned ones", () => {
  const by = (sym, chain) => RWA_ASSETS.find((a) => a.symbol === sym && a.chain === chain);
  expect(by("PAXG", "ETH").address.toLowerCase()).toBe("0x45804880de22913dafe09f4980848ece6ecbaf78");
  expect(by("PAXG", "ETH").decimals).toBe(18);
  expect(by("XAUt", "ETH").address.toLowerCase()).toBe("0x68749665ff8d2d112fa859aa293f07a622782f38");
  expect(by("XAUt", "ETH").decimals).toBe(6);
  expect(by("USDY", "XLM").stellarIssuer).toBe("GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6");
  expect(by("CETES", "XLM").stellarIssuer).toBe("GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC");
});

test("validator rejects bad entries", () => {
  const good = RWA_ASSETS.find((a) => a.chain === "ETH");
  expect(assetProblem(good)).toBeNull();
  expect(assetProblem({ ...good, address: "0x123" })).toMatch(/address/);
  expect(assetProblem({ ...good, chainId: 56 })).toMatch(/chainId/);
  expect(assetProblem({ ...good, issuer: "random" })).toMatch(/issuer/);
  expect(assetProblem({ ...good, logo: "http://x" })).toMatch(/https/);
  expect(validateAssets([good, good]).dropped[0].why).toBe("duplicate id");
});

test("filters: category + search on symbol/name/underlying", () => {
  expect(filterAssets(RWA_ASSETS, { category: "gold" }).every((a) => a.category === "gold")).toBe(true);
  const aapl = filterAssets(RWA_ASSETS, { query: "aapl" });
  expect(aapl.length).toBeGreaterThan(0);
  expect(aapl.every((a) => /aapl/i.test(a.symbol + a.name + (a.underlying || "")))).toBe(true);
});

test("price keys", () => {
  expect(llamaKey({ chain: "BSC", address: "0xABC" })).toBe("bsc:0xabc");
  expect(llamaKey({ chain: "XLM", code: "USDY" })).toBe("coingecko:ondo-us-dollar-yield");
});
