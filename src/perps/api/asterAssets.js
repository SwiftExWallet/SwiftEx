// Chains + assets for Perps deposit / withdraw. Source of truth = Aster's live lists (cached 24h):
//   deposit/assets, withdraw/assets (www.asterdex.com bapi, public) and GET /fapi/v3/assetIndex
//   (public; bidBuffer = collateral haircut in Multi-Assets mode).
// Vaults are from Aster's docs ("deposit-withdrawal": chain / chainId / contract address).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { asterFetch } from "./asterPublic";

export const NATIVE_TOKEN = "0xfdae1ba7c826abdc4c99903c8056f82a1a04a615"; // Aster's native placeholder

// key = the app's CHAINS key (src/utilities/TokenUtils.js) used by the existing EVM signer.
export const PERPS_CHAINS = [
  {
    chainId: 56,
    key: "BNB",
    name: "BNB Chain",
    asterName: "BSC",
    native: "BNB",
    vault: "0x128463A60784c4D3f46c23Af3f65Ed859Ba87974",
    explorer: "https://bscscan.com",
    explorerName: "BscScan",
  },
  {
    chainId: 1,
    key: "ETH",
    name: "Ethereum",
    asterName: "ETH",
    native: "ETH",
    vault: "0x604DD02d620633Ae427888d41bfd15e38483736E",
    explorer: "https://etherscan.io",
    explorerName: "Etherscan",
    gasNote: "Ethereum network fees can be a few dollars.",
  },
  {
    chainId: 42161,
    key: "ARB",
    name: "Arbitrum",
    asterName: "Arbitrum",
    native: "ETH",
    vault: "0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5",
    explorer: "https://arbiscan.io",
    explorerName: "Arbiscan",
  },
];
export const chainById = (id) => PERPS_CHAINS.find((c) => c.chainId === Number(id)) || PERPS_CHAINS[0];
export const txUrl = (chainId, hash) => `${chainById(chainId).explorer}/tx/${hash}`;

// Deposit picker: stablecoins + the chain's native coin (only if Aster lists them for that chain).
export const STABLES = ["USDT", "USDC", "USDCE", "USD1", "USDF"];
// Isolated margin / Single-Asset mode: only these count as margin.
export const SINGLE_ASSET_MARGIN = ["USDT", "USD1"];
export const displayName = (name) => (name === "USDCE" ? "USDC.e" : name);

const CACHE_KEY = "perps_asset_lists_v1";
const TTL = 24 * 60 * 60 * 1000;
const PARTIAL_TTL = 5 * 60 * 1000;
const fresh = (m) =>
  !!m && Array.isArray(m.withdraw) && m.withdraw.length > 0 && Date.now() - m.at < (m.partial ? PARTIAL_TTL : TTL);
const IDS = PERPS_CHAINS.map((c) => c.chainId).join(",");
const BAPI = "https://www.asterdex.com/bapi/futures/v1/public/future/aster";

let mem = null; // { at, deposit: [...], withdraw: [...], collateral: { ASSET: ratio } }
let inflight = null;

const slim = (a) => ({
  name: String(a.name),
  chainId: Number(a.chainId),
  contract: String(a.contractAddress || "").toLowerCase(),
  decimals: Number(a.decimals),
  isNative: !!a.isNative || String(a.contractAddress || "").toLowerCase() === NATIVE_TOKEN,
  minDeposit: a.minDeposit !== undefined && a.minDeposit !== null ? String(a.minDeposit) : "0",
});

const load = async () => {
  const [dep, wd, idx] = await Promise.all([
    asterFetch(`${BAPI}/deposit/assets?chainIds=${IDS}&networks=EVM&accountType=perp`, { timeoutMs: 15000 }),
    asterFetch(`${BAPI}/withdraw/assets?chainIds=${IDS}&networks=EVM&accountType=perp`, { timeoutMs: 15000 }),
    asterFetch("/fapi/v3/assetIndex", { timeoutMs: 15000 }),
  ]);
  if (dep.error || !Array.isArray(dep.data && dep.data.data)) throw new Error(dep.error || "No asset list");
  const collateral = {};
  (Array.isArray(idx.data) ? idx.data : []).forEach((r) => {
    const asset = String(r.symbol || "").replace(/USD$/, "");
    const buf = Number(r.bidBuffer);
    if (asset && Number.isFinite(buf)) collateral[asset] = Math.max(0, 1 - buf);
  });
  return {
    at: Date.now(),
    deposit: dep.data.data.filter((a) => a && a.network === "EVM").map(slim),
    withdraw:
      wd.data && Array.isArray(wd.data.data) && wd.data.data.length ? wd.data.data.map(slim) : (mem && mem.withdraw) || [],
    // A list that failed to load is retried after PARTIAL_TTL instead of being kept for a day.
    partial: !!(wd.error || idx.error || !(wd.data && Array.isArray(wd.data.data) && wd.data.data.length)),
    collateral: Object.keys(collateral).length ? collateral : (mem && mem.collateral) || {},
  };
};

// { deposit, withdraw, collateral, at } — memory, then AsyncStorage (≤24h), then network.
// A stale cache is still returned if the network fails.
export const getAssetLists = async ({ force = false } = {}) => {
  if (!force && fresh(mem)) return mem;
  if (!mem) {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) mem = JSON.parse(raw);
    } catch (e) {
      mem = null;
    }
    if (!force && fresh(mem)) return mem;
  }
  if (!inflight) {
    inflight = load()
      .then((lists) => {
        mem = lists;
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(lists)).catch(() => {});
        return lists;
      })
      .catch((e) => {
        if (mem) return mem;
        throw e;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

export const depositAssetsFor = (lists, chainId) => {
  const list = lists.deposit.filter((a) => a.chainId === chainId && (a.isNative || STABLES.includes(a.name)));
  // native first, then stables in our order
  return list.sort((a, b) => (a.isNative ? -1 : b.isNative ? 1 : STABLES.indexOf(a.name) - STABLES.indexOf(b.name)));
};

// null = unknown (list missing): callers then trust Aster's user-withdraw-info chains.
export const withdrawChainsFor = (lists, asset) =>
  !lists || !lists.withdraw || lists.withdraw.length === 0
    ? null
    :
    PERPS_CHAINS.filter((c) => lists.withdraw.some((a) => a.chainId === c.chainId && a.name === asset));

// Collateral value in Multi-Assets mode, e.g. 0.95. USD stables ~1. null = unknown.
export const collateralRatio = (lists, asset) => {
  const key = asset === "USDCE" ? "USDCE" : asset;
  const r = lists && lists.collateral ? lists.collateral[key] : undefined;
  return typeof r === "number" ? r : null;
};
