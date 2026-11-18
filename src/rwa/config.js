// RWA (tokenized stocks / ETFs / gold / treasuries) — feature switch and fixed settings.
// When RWA_ENABLED is false the app must look and behave exactly as before (no entry point, no screens).
// Dev builds only until legal review.
export const RWA_ENABLED = __DEV__;

// Buying / selling is not enabled in this phase: quotes only. The Confirm button stays disabled.
export const RWA_TRADING_ENABLED = false;

// ---- Regions (ISO 3166-1 alpha-2, from AppStatusChecks.countryCode) ----
// Fail closed: unknown country => RWA hidden.
export const SANCTIONED = ["CU", "IR", "KP", "SY", "RU", "BY", "VE", "MM", "AF"];
export const EEA = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT",
  "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
];

// Per-issuer blocked countries (rwa-plan.md). Each asset's `regions` key points here.
//  ondo: US, Canada, sanctioned; professional/qualified-only markets are blocked too
//        (EEA, UK, CH, SG, HK, MY, BR) — docs.ondo.finance/ondo-stocks/eligibility.
//  xstocks: US, CA, UK, AU blocked; EU off at launch.
//  paxos / tether / etherfuse: not decided in the plan yet — strict default (US + sanctioned), verify before launch.
export const REGION_RULES = {
  ondo: ["US", "CA", "GB", "CH", "SG", "HK", "MY", "BR", ...EEA, ...SANCTIONED],
  "stellar-ondo": ["US", "CA", "GB", "CH", "SG", "HK", "MY", "BR", ...EEA, ...SANCTIONED],
  xstocks: ["US", "CA", "GB", "AU", ...EEA, ...SANCTIONED],
  paxos: ["US", ...SANCTIONED],
  tether: ["US", ...SANCTIONED],
  etherfuse: ["US", ...SANCTIONED],
};

// ---- Payment tokens (same contracts as the app's token lists) ----
export const PAY_TOKENS = {
  ETH: [
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  ],
  BSC: [
    { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  ],
};
// Ondo Global Markets pairs: USDC only.
export const ONDO_PAY_SYMBOLS = ["USDC"];
// xStocks: minimum order value (USD).
export const XSTOCKS_MIN_USD = 20;

// 1inch Limit Order Protocol v4 (Fusion spender, same as utilities/FusionAllowance.js).
export const ONEINCH_LOP = "0x111111125421ca6dc452d289314280a0f8842a65";
// Multicall3 (same address on Ethereum and BNB Chain).
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
// Rough gas for one ERC-20 approve (USDT is the most expensive).
export const APPROVE_GAS = 65000;

// Our chain keys -> app CHAINS keys / backend chain names / DefiLlama chain names.
export const CHAIN_INFO = {
  ETH: { appKey: "ETH", backend: "ETH", llama: "ethereum", chainId: 1, label: "Ethereum", short: "ETH", native: "ETH", nativePriceKey: "coingecko:ethereum" },
  BSC: { appKey: "BNB", backend: "BSC", llama: "bsc", chainId: 56, label: "BNB Chain", short: "BNB", native: "BNB", nativePriceKey: "coingecko:binancecoin" },
  XLM: { appKey: "STR", backend: null, llama: null, chainId: null, label: "Stellar", short: "XLM", native: "XLM", nativePriceKey: "coingecko:stellar" },
};

export const XSTOCKS_API = "https://api.xstocks.fi/api/v2/public";
export const LLAMA_API = "https://coins.llama.fi";
export const HORIZON = "https://horizon.stellar.org";
// Stellar USDC (Circle) — the pay asset for USDY / CETES.
export const STELLAR_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
