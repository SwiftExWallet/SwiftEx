// Read-only on-chain reads for RWA: token balances (Multicall3), native balance, allowance, gas price,
// Stellar balances (Horizon). Uses the app's RPC list (CHAINS[..].rpcUrl + backupRPCUrls), but with
// a per-request timeout and fallback to the next RPC on ANY error (TokenUtils.callWithFallback only
// falls back on rate limits and has no timeout, which could leave the holdings spinner forever).
import { ethers } from "ethers";
import { CHAINS } from "../../utilities/TokenUtils";
import { CHAIN_INFO, MULTICALL3, ONEINCH_LOP, HORIZON } from "../config";

const RPC_TIMEOUT_MS = 12000;
const providers = new Map(); // url -> StaticJsonRpcProvider (no network auto-detection calls)
const lastGood = new Map(); // appKey -> url that worked last

const rpcUrls = (appKey) => {
  const c = CHAINS[appKey] || {};
  const list = [c.rpcUrl, ...(c.backupRPCUrls || [])].filter((u) => typeof u === "string" && /^https:\/\//.test(u));
  // publicnode first: it answers 200-call Multicall3 reads in ~1s (tested 2026-11-18); some of the
  // app's other RPCs time out on large eth_calls.
  const uniq = Array.from(new Set(list)).sort((a, b) => (/publicnode\.com/.test(b) ? 1 : 0) - (/publicnode\.com/.test(a) ? 1 : 0));
  const good = lastGood.get(appKey);
  return good && uniq.includes(good) ? [good, ...uniq.filter((u) => u !== good)] : uniq;
};

const providerFor = (url, chainId) => {
  if (!providers.has(url)) providers.set(url, new ethers.providers.StaticJsonRpcProvider({ url, timeout: RPC_TIMEOUT_MS }, chainId));
  return providers.get(url);
};

// Run fn(provider) on the chain's RPCs in order until one succeeds (max 4 tries).
export const withRpc = async (chain, fn) => {
  const info = CHAIN_INFO[chain];
  const urls = rpcUrls(info.appKey).slice(0, 4);
  let lastErr = new Error("no RPC configured");
  for (const url of urls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await fn(providerFor(url, info.chainId));
      lastGood.set(info.appKey, url);
      return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
};

const fetchWithTimeout = async (url, ms = 15000) => {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), ms) : null;
  try {
    return await fetch(url, controller ? { signal: controller.signal } : undefined);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const ERC20 = new ethers.utils.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const MC = ["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])"];
const CHUNK = 200;

// { [assetId]: "raw units string" } for assets with a non-zero balance on one EVM chain.
// Each chunk falls back to the next RPC on its own; a chunk failing everywhere throws.
export const evmBalances = async (chain, wallet, assets) => {
  const info = CHAIN_INFO[chain];
  if (!info || !info.chainId || !wallet || !assets.length) return {};
  const out = {};
  const chunks = [];
  for (let i = 0; i < assets.length; i += CHUNK) chunks.push(assets.slice(i, i + CHUNK));
  // 2 chunks at a time (keeps public RPCs happy; ~1s per chunk).
  for (let i = 0; i < chunks.length; i += 2) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      chunks.slice(i, i + 2).map(async (part) => {
        const calls = part.map((a) => ({ target: a.address, allowFailure: true, callData: ERC20.encodeFunctionData("balanceOf", [wallet]) }));
        const res = await withRpc(chain, (provider) => new ethers.Contract(MULTICALL3, MC, provider).aggregate3(calls));
        res.forEach((r, j) => {
          if (!r.success || !r.returnData || r.returnData === "0x") return;
          const v = ethers.BigNumber.from(r.returnData);
          if (!v.isZero()) out[part[j].id] = v.toString();
        });
      })
    );
  }
  return out;
};

// Stellar balances for the listed assets: { [assetId]: "1.2345678" } (non-zero only; trustline needed).
export const stellarBalances = async (account, assets) => {
  if (!account || !assets.length) return {};
  const r = await fetchWithTimeout(`${HORIZON}/accounts/${account}`);
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(`Horizon ${r.status}`);
  const json = await r.json();
  const out = {};
  (json.balances || []).forEach((b) => {
    const a = assets.find((x) => x.code === b.asset_code && x.stellarIssuer === b.asset_issuer);
    if (a && Number(b.balance) > 0) out[a.id] = b.balance;
  });
  return out;
};

// Share multiplier (corporate actions): Ondo SyntheticSharesOracle.getSValue(token) or
// xStocks token.getCurrentMultiplier() (first word). Returns a number (1.0 = none) or null.
export const readMultiplier = async (asset) => {
  const m = asset && asset.multiplier;
  if (!m || m.kind === "none" || !CHAIN_INFO[asset.chain] || !CHAIN_INFO[asset.chain].chainId) return null;
  const call =
    m.kind === "ondo-svalue" && m.oracle
      ? { to: m.oracle, data: `0x0a562827${asset.address.slice(2).toLowerCase().padStart(64, "0")}` }
      : m.kind === "xstocks-rebase"
      ? { to: asset.address, data: "0x2b63c300" }
      : null;
  if (!call) return null;
  try {
    const raw = await withRpc(asset.chain, (provider) => provider.call(call));
    if (!raw || raw.length < 66) return null;
    return Number(ethers.utils.formatUnits(ethers.BigNumber.from(raw.slice(0, 66)), 18));
  } catch (e) {
    return null;
  }
};

// Pay-side checks for a quote: token balance, allowance to the 1inch LOP, native balance, gas price.
export const payTokenState = async (chain, wallet, tokenAddress) => {
  return withRpc(chain, async (provider) => {
    const token = new ethers.Contract(tokenAddress, ERC20, provider);
    const [balance, allowance, native, gasPrice] = await Promise.all([
      token.balanceOf(wallet),
      token.allowance(wallet, ONEINCH_LOP),
      provider.getBalance(wallet),
      provider.getGasPrice(),
    ]);
    return {
      balance: balance.toString(),
      allowance: allowance.toString(),
      native: native.toString(),
      gasPrice: gasPrice.toString(),
    };
  });
};
