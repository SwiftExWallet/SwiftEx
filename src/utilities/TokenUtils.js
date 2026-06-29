import axios from "axios";
import StellarTokenList from "../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/stellar/Tokens.json";
import { ARB, AVAX, BASE, BSC, DYDX, ETH, OPT, POL, PUBLIC_TX_CHEKER, STELLAR_URL, STR } from "../Dashboard/constants";
import * as StellarSdk from '@stellar/stellar-sdk';
import { FOLIO_BASE_ROUTE, REACT_APP_COIN_GECKO_SIMPLE_PRICE_URL, REACT_APP_HOST } from "../Dashboard/exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import apiHelper from "../../src/Dashboard/exchange/crypto-exchange-front-end-main/src/apiHelper";
import PancakeList from "../../src/Dashboard/tokens/pancakeSwap/PancakeList.json";
const BASEROUTE = `${REACT_APP_HOST}/v1/portfolio/`;

const CONFIG = {
  TIMEOUT: 10000,
  APIS: {
    COINGECKO: REACT_APP_COIN_GECKO_SIMPLE_PRICE_URL,
    STELLAR_HORIZON: STELLAR_URL.URL,
    DYDX_INDEXER: DYDX.RPC
  },
  TOKEN_LISTS: {
    XLM: StellarTokenList
  }
};

const CACHE_CONFIG = {
  TTL: 60 * 1000,
};

export const EVM_NETWORK_CONFIG = {
  'eth-mainnet': {
    chain: 'ETH',
    nativeName: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeImage: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  },
  'bnb-mainnet': {
    chain: 'BSC',
    nativeName: 'Binance Coin',
    nativeSymbol: 'BNB',
    nativeImage: 'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
  },
  'matic-mainnet': {
    chain: 'POL',
    nativeName: 'Polygon',
    nativeSymbol: 'MATIC',
    nativeImage: 'https://assets.coingecko.com/coins/images/32440/large/polygon.png?1698233684',
  },
  'arb-mainnet': {
    chain: 'ARB',
    nativeName: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeImage: 'https://arbitrum.foundation/logo.png',
  },
  'base-mainnet': {
    chain: 'BASE',
    nativeName: 'Base',
    nativeSymbol: 'BASE',
    nativeImage: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  },
  'avax-mainnet': {
    chain: 'AVAX',
    nativeName: 'Avalanchec',
    nativeSymbol: 'AVAX',
    nativeImage: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
  },
  'opt-mainnet': {
    chain: 'OPT',
    nativeName: 'Optimism',
    nativeSymbol: 'OPT',
    nativeImage: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  },
};

const walletCache = new Map();

const getCacheKey = (evmAddress, stellarAddress) => {
  return `${evmAddress || 'null'}_${stellarAddress || 'null'}`;
};

const getFromCache = (cacheKey) => {
  const cached = walletCache.get(cacheKey);
  if (!cached) return null;
  const age = Date.now() - cached.timestamp;
  if (age < CACHE_CONFIG.TTL) return cached.data;
  return null;
};

const saveToCache = (cacheKey, data) => {
  walletCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
};

const isValidAddress = (address) => {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return true;
  if (/^G[A-Z2-7]{55}$/.test(address)) return true;
  return false;
};

const parseNumber = (value, decimals = 6) => {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : parseFloat(num.toFixed(decimals));
};

let stellarImageCache = { xlm: {}, symbols: {} };

const loadStellarTokenList = () => {
  try {
    if (Array.isArray(CONFIG.TOKEN_LISTS.XLM.assets)) {
      CONFIG.TOKEN_LISTS.XLM.assets.forEach(token => {
        const code = token.code || '';
        const issuer = token.issuer || '';
        const assetKey = code && issuer ? `${code}:${issuer}` : '';
        const symbol = code.toUpperCase();
        const logoURI = token.icon || token.logoURI || token.image || null;
        if (assetKey && logoURI) {
          stellarImageCache.xlm[assetKey.toLowerCase()] = logoURI;
        }
        if (symbol && logoURI) {
          stellarImageCache.symbols[symbol] = logoURI;
        }
      });
    }
  } catch (error) {
    console.log("loadStellarTokenList error:", error);
  }
};

loadStellarTokenList();

const getStellarTokenImage = (symbol = null, issuer = null, contractAddress = null) => {
  if (symbol && issuer) {
    const assetKey = `${symbol}:${issuer}`.toLowerCase();
    if (stellarImageCache.xlm[assetKey]) return stellarImageCache.xlm[assetKey];
  }
  if (symbol) {
    const symbolKey = symbol.toUpperCase();
    if (stellarImageCache.symbols?.[symbolKey]) return stellarImageCache.symbols[symbolKey];
  }
  if (contractAddress && contractAddress !== 'Native') {
    return stellarImageCache.xlm[contractAddress.toLowerCase()] || null;
  }
  return null;
};

const getXLMPrice = async () => {
  try {
    const response = await axios.get(CONFIG.APIS.COINGECKO, {
      params: { ids: 'stellar', vs_currencies: 'usd' },
      timeout: CONFIG.TIMEOUT
    });
    return response.data?.stellar?.usd || 0.10;
  } catch (error) {
    return 0.10;
  }
};

const getEVMTokens = async (network, walletAddress, onProgress = null, cacheKey = null, apiTokens = []) => {
  const config = EVM_NETWORK_CONFIG[network];
  if (!config) throw new Error(`Unknown network: ${network}`);
  if (!isValidAddress(walletAddress)) throw new Error(`Invalid address for ${network}`);

  try {
    const networkData = apiTokens.filter(t => t.network === network);
    const tokens = [];
    let totalValueUSD = 0;

    for (const item of networkData) {
      const isNative = item.tokenAddress === null;
      const decimals = item.tokenMetadata?.decimals ?? 18;
      const rawBalance = parseInt(item.tokenBalance, 16);
      const balance = parseNumber(rawBalance / Math.pow(10, decimals));
      const price = parseNumber(parseFloat(item.tokenPrices?.[0]?.value || 0), 2);
      const balanceUSD = parseNumber(balance * price, 2);

      tokens.push({
        chain: config.chain,
        name: isNative ? config.nativeName : (item.tokenMetadata?.name || 'Unknown'),
        symbol: isNative ? config.nativeSymbol : (item.tokenMetadata?.symbol || '???'),
        balance,
        balanceUSD,
        decimals,
        contractAddress: isNative ? 'Native' : item.tokenAddress,
        active:isNative&&true,
        price,
        imageUrl: isNative ? config.nativeImage : item.tokenMetadata?.logo || null,
      });
      totalValueUSD += balanceUSD;
    }

    if (onProgress) {
      onProgress({
        chain: config.chain,
        tokens,
        totalValueUSD: parseNumber(totalValueUSD, 2),
        isPartial: false
      });
    }

    return { tokens, totalValueUSD: parseNumber(totalValueUSD, 2) };

  } catch (error) {
    console.error(`${network} fetch failed:`, error);
    if (cacheKey) {
      const cached = getFromCache(cacheKey);
      if (cached?.tokens) {
        const cachedTokens = cached.tokens.filter(t => t.chain === config.chain);
        return { tokens: cachedTokens, totalValueUSD: cachedTokens.reduce((s, t) => s + t.balanceUSD, 0) };
      }
    }
    return { tokens: [], totalValueUSD: 0 };
  }
};

const getStellarTokens = async (walletAddress, onProgress = null, cacheKey = null) => {
  try {
    const server = new StellarSdk.Horizon.Server(CONFIG.APIS.STELLAR_HORIZON);
    const account = await server.accounts().accountId(walletAddress).call();
    const tokens = [];
    let totalValueUSD = 0;

    const prices = await getStellarTokenPrices(account.balances);

    for (const balance of account.balances) {
      if (balance.asset_type === 'liquidity_pool_shares') continue;

      let symbol, name, contractAddress, price, balanceAmount, imageUrl;

      if (balance.asset_type === 'native') {
        symbol = 'XLM';
        name = 'Stellar Lumens';
        contractAddress = 'Native';
        balanceAmount = parseNumber(balance.balance);
        imageUrl = getStellarTokenImage('XLM', null, 'Native');
        price = parseNumber(prices['XLM:native']?.price || 0, 6);

      } else {
        symbol = balance.asset_code;
        name = balance.asset_code;
        contractAddress = balance.asset_issuer;
        balanceAmount = parseNumber(balance.balance);
        imageUrl = getStellarTokenImage(symbol, balance.asset_issuer);

        const priceKey = `${symbol}:${contractAddress}`;
        price = parseNumber(prices[priceKey]?.price || 0, 6);
      }

      const balanceUSD = parseNumber(balanceAmount * price, 2);
      totalValueUSD += balanceAmount * price;

      const token = {
        chain: 'Stellar',
        name,
        symbol,
        balance: balanceAmount,
        balanceUSD,
        decimals: 7,
        contractAddress,
        active: balance.asset_type === 'native',
        price,
        imageUrl,
      };

      tokens.push(token);

      if (onProgress) {
        onProgress({
          chain: 'Stellar',
          tokens: [token],
          totalValueUSD: parseNumber(totalValueUSD, 2),
          isPartial: true
        });
      }
    }

    if (onProgress && tokens.length > 0) {
      onProgress({
        chain: 'Stellar',
        tokens,
        totalValueUSD: parseNumber(totalValueUSD, 2),
        isPartial: false
      });
    }

    return { tokens, totalValueUSD: parseNumber(totalValueUSD, 2) };

  } catch (error) {
    console.error('Stellar fetch failed:', error);
    if (cacheKey) {
      const cached = getFromCache(cacheKey);
      if (cached?.tokens) {
        const stellarTokens = cached.tokens.filter(t => t.chain === 'Stellar');
        return { tokens: stellarTokens, totalValueUSD: stellarTokens.reduce((s, t) => s + t.balanceUSD, 0) };
      }
    }

    const xlmPrice = await getXLMPrice();
    const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
    const emptyTokens = [
      {
        chain: 'Stellar',
        name: 'Stellar Lumens',
        symbol: 'XLM',
        balance: 0,
        balanceUSD: 0,
        decimals: 7,
        contractAddress: 'Native',
        active: true,
        price: parseNumber(xlmPrice, 2),
        imageUrl: getStellarTokenImage('XLM', null, 'Native'),
      },
      {
        chain: 'Stellar',
        name: 'USD Coin',
        symbol: 'USDC',
        balance: 0,
        balanceUSD: 0,
        decimals: 7,
        contractAddress: USDC_ISSUER,
        price: 1,
        imageUrl: getStellarTokenImage('USDC', USDC_ISSUER),
      }
    ];

    if (onProgress) {
      onProgress({
        chain: 'Stellar',
        tokens: emptyTokens,
        totalValueUSD: 0,
        isPartial: false
      });
    }

    return { tokens: emptyTokens, totalValueUSD: 0 };
  }
};

const getStellarTokenPrices = async (balances) => {
  try {
    const addresses = balances
      .filter(b => b.asset_type !== 'liquidity_pool_shares')
      .map(b => {
        if (b.asset_type === 'native') return 'XLM:native';
        return `${b.asset_code}:${b.asset_issuer}`;
      }); 
    const response = await apiHelper.post(`${FOLIO_BASE_ROUTE}/prices`,{ addresses });

    return response.data?.prices || {};
  } catch {
    return {};
  }
};

const getDydxBalance = async (walletAddress, onProgress = null, cacheKey = null) => {
  try {
    const res = await axios.get(
      `${CONFIG.APIS.DYDX_INDEXER}/v4/addresses/${walletAddress}/subaccountNumber/0`,
      { timeout: CONFIG.TIMEOUT }
    );
    const subaccount = res?.data?.subaccount || {};
    const equity = parseNumber(subaccount.equity || 0);
    const quoteBalance = parseNumber(subaccount.quoteBalance || 0);
    const tokens = [];

    const mainBalanceToken = {
      chain: DYDX.symbol,
      name: DYDX.symbol,
      symbol: DYDX.symbol,
      balance: equity,
      balanceUSD: equity,
      decimals: 6,
      contractAddress: 'Native',
      price: 1,
      imageUrl: DYDX.imageUrl,
      active:true
    };

    const usdcToken = {
      chain: DYDX.symbol,
      name: 'USD Coin',
      symbol: 'USDC',
      balance: quoteBalance,
      balanceUSD: quoteBalance,
      decimals: 6,
      contractAddress: 'USDC',
      price: 1,
      imageUrl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
      active:true
    };
    tokens.push(mainBalanceToken);
    tokens.push(usdcToken);
    const totalValueUSD = equity;
    if (onProgress) {
      onProgress({
        chain: 'DYDX',
        tokens,
        totalValueUSD,
        isPartial: false
      });
    }

    return {
      tokens,
      totalValueUSD
    };

  } catch (error) {

    console.error("dYdX fetch failed:", error);

    const tokens = [
      {
        chain: DYDX.symbol,
        name: DYDX.symbol,
        symbol: 'USD',
        balance: 0,
        balanceUSD: 0,
        decimals: 6,
        contractAddress: 'Native',
        price: 1,
        imageUrl: DYDX.imageUrl
      }
    ];

    return { tokens, totalValueUSD: 0 };
  }
};

export async function GetWalletTokens(evmAddress = null, stellarAddress = null, dydxAddress = null, onProgress = null) {
  console.log("GetWalletTokens", evmAddress, stellarAddress);
  if (!evmAddress && !stellarAddress) {
    throw new Error('At least one wallet address is required');
  }

  const cacheKey = getCacheKey(evmAddress, stellarAddress);
  const cachedData = getFromCache(cacheKey);
  if (cachedData) {
    console.debug('returning cached data (under 1 minute old)');
    if (onProgress) {
      onProgress({
        allTokens: cachedData.tokens,
        totalValueUSD: cachedData.totalValueUSD,
        isPartial: false,
        fromCache: true
      });
    }
    return cachedData;
  }

  try {
    const allTokens = [];
    let totalValueUSD = 0;
    const fetchPromises = [];

    if (evmAddress) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(evmAddress)) {
        throw new Error('Invalid EVM address format');
      }

      let apiTokens = [];
      const portfolioResult = await apiHelper.get(`${BASEROUTE}${evmAddress}`);
      if (portfolioResult.success) {
        apiTokens = portfolioResult.data.data.tokens || [];
      }

      const progressHandler = (update) => {
        if (onProgress) {
          onProgress({
            ...update,
            allTokens: [...allTokens, ...update.tokens],
            totalValueUSD: totalValueUSD + update.totalValueUSD
          });
        }
      };

      Object.keys(EVM_NETWORK_CONFIG).forEach(network => {
        fetchPromises.push(getEVMTokens(network, evmAddress, progressHandler, cacheKey, apiTokens));
      });
    }

    if (stellarAddress) {
      if (!/^G[A-Z2-7]{55}$/.test(stellarAddress)) {
        throw new Error('Invalid Stellar address format');
      }
      fetchPromises.push(
        getStellarTokens(stellarAddress, (update) => {
          if (onProgress) {
            onProgress({
              ...update,
              allTokens: [...allTokens, ...update.tokens],
              totalValueUSD: totalValueUSD + update.totalValueUSD
            });
          }
        }, cacheKey)
      );
    }

     if (dydxAddress) {
      fetchPromises.push(
        getDydxBalance(dydxAddress, (update) => {
          if (onProgress) {
            onProgress({
              ...update,
              allTokens: [...allTokens, ...update.tokens],
              totalValueUSD: totalValueUSD + update.totalValueUSD
            });
          }
        }, cacheKey)
      );
    }

    const results = await Promise.allSettled(fetchPromises);
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        allTokens.push(...result.value.tokens);
        totalValueUSD += result.value.totalValueUSD;
      }
    });

    allTokens.sort((a, b) => b.balanceUSD - a.balanceUSD);
    const result = {
      tokens: allTokens,
      totalValueUSD: parseNumber(totalValueUSD, 2)
    };
    saveToCache(cacheKey, result);
    console.debug('data cached successfully');
    return result;

  } catch (error) {
    const cachedData = walletCache.get(cacheKey);
    if (cachedData) {
      console.debug('returning expired cached data due to error');
      return cachedData.data;
    }
    throw new Error(`Failed to fetch wallet tokens: ${error.message}`);
  }
}

export const TemporaryTokens=[
    {
        "balance":0.0,
        "balanceUSD": 0.00,
        "chain": "Stellar",
        "contractAddress": "Native",
        "decimals": 7,
        "imageUrl": STR.imageUrl,
        "name": "Stellar Lumens",
        "price":0,
        "symbol": "STR",
        "navigationPath":"SendXLM"
    },
    {
        "balance":0.0,
        "balanceUSD": 0.00,
        "chain": "ETH",
        "contractAddress": "Native",
        "decimals": 18,
        "imageUrl": ETH.imageUrl,
        "name": "Ethereum",
        "price":0,
        "symbol": "ETH",
        "navigationPath":"Send"
    },
    {
        "balance":0.0,
        "balanceUSD": 0.00,
        "chain": "BSC",
        "contractAddress": "Native",
        "decimals": 18,
        "imageUrl": BSC.imageUrl,
        "name": "Binance",
        "price":0,
        "symbol": "BNB",
        "navigationPath":"Send"
    },
    {
        "balance":0.0,
        "balanceUSD": 0.00,
        "chain": "POL",
        "contractAddress": "Native",
        "decimals": 18,
        "imageUrl": POL.imageUrl,
        "name": "Polygon",
        "price":0,
        "symbol": "POL",
        "navigationPath":"Send"
    },
    {
        "balance":0.0,
        "balanceUSD": 0.00,
        "chain": "ARB",
        "contractAddress": "Native",
        "decimals": 18,
        "imageUrl": ARB.imageUrl,
        "name": "Arbitrum",
        "price":0,
        "symbol": "ARB",
        "navigationPath":"Send"
    },
    {
        "balance":0.0,
        "balanceUSD": 0.00,
        "chain": "OPT",
        "contractAddress": "Native",
        "decimals": 18,
        "imageUrl": OPT.imageUrl,
        "name": "Optimism",
        "price":0,
        "symbol": "OPT",
        "navigationPath":"Send"
    },
    {
        "balance":0.0,
        "balanceUSD": 0.00,
        "chain": "AVAX",
        "contractAddress": "Native",
        "decimals": 18,
        "imageUrl": AVAX.imageUrl,
        "name": "Avalanche",
        "price":0,
        "symbol": "AVAX",
        "navigationPath":"Send"
    },
    {
        "balance":0.0,
        "balanceUSD": 0.00,
        "chain": "BASE",
        "contractAddress": "Native",
        "decimals": 18,
        "imageUrl": BASE.imageUrl,
        "name": "Base",
        "price":0,
        "symbol": "BASE",
        "navigationPath":"Send"
    },
    {
        "balance":0.0,
        "balanceUSD": 0.00,
        "chain": DYDX.symbol,
        "contractAddress": "Native",
        "decimals": 6,
        "imageUrl": DYDX.imageUrl,
        "name": DYDX.symbol,
        "price":0,
        "symbol": DYDX.symbol,
        "navigationPath":"Send"
    },
];

export const CHAINS = {
  ARB: {
    rpcUrl: ARB.RPC,
    chainId: ARB.chainId,
    nativeChainKey: ARB.nativeChainKey,
    minGasGwei: ARB.minGasGwei,
    imageUrl: ARB.imageUrl,
    name: ARB.name,
    symbol: ARB.symbol,
    chainName: ARB.chainName,
    subName: ARB.subName,
    gasLimit: ARB.gasLimit,
    supportedTokenList: "https://raw.githubusercontent.com/sachin-swiftex/resources/master/arb_tokens.json",
    nativeToken: {
      "name": ARB.name,
      "symbol": ARB.symbol,
      "address": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      "type": ARB.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": ARB.imageUrl
    },
    bridgeSupportTokens: ARB.bridgeSupportTokens,
    sendEnable:true,
    receiveEnable:true,
    bridgeEnable:true,
    swapEnable:true,
    importForSetupApp:true,
    importForSetupedApp:true,
    supportedForInterSwap:ARB.supportedForInterSwap,
    chainNameInThirdParty:ARB.chainNameInThirdParty,
    eipId:ARB.eipId
  },
  POL: {
    rpcUrl: POL.RPC,
    chainId: POL.chainId,
    nativeChainKey: POL.nativeChainKey,
    minGasGwei: POL.minGasGwei,
    imageUrl: POL.imageUrl,
    name: POL.name,
    symbol: POL.symbol,
    chainName: POL.chainName,
    subName: POL.subName,
    gasLimit: POL.gasLimit,
    supportedTokenList: "https://raw.githubusercontent.com/sachin-swiftex/resources/master/poly_tokens.json",
    nativeToken: {
      "name": POL.name,
      "symbol": POL.symbol,
      "address": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      "type": POL.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": POL.imageUrl
    },
    bridgeSupportTokens: POL.bridgeSupportTokens,
    sendEnable:true,
    receiveEnable:true,
    bridgeEnable:true,
    swapEnable:true,
    importForSetupApp:true,
    importForSetupedApp:true,
    supportedForInterSwap:POL.supportedForInterSwap,
    chainNameInThirdParty:POL.chainNameInThirdParty,
    eipId:POL.eipId
  },
  OPT: {
    rpcUrl: OPT.RPC,
    chainId: OPT.chainId,
    nativeChainKey: OPT.nativeChainKey,
    minGasGwei: OPT.minGasGwei,
    imageUrl: OPT.imageUrl,
    name: OPT.name,
    symbol: OPT.symbol,
    chainName: OPT.chainName,
    subName: OPT.subName,
    gasLimit: OPT.gasLimit,
    supportedTokenList: "https://raw.githubusercontent.com/sachin-swiftex/resources/master/op_tokens.json",
    nativeToken: {
      "name": OPT.name,
      "symbol": OPT.symbol,
      "address": "0x4200000000000000000000000000000000000006",
      "type": OPT.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": OPT.imageUrl
    },
    bridgeSupportTokens: OPT.bridgeSupportTokens,
    sendEnable:true,
    receiveEnable:true,
    bridgeEnable:true,
    swapEnable:true,
    importForSetupApp:true,
    importForSetupedApp:true,
    supportedForInterSwap:OPT.supportedForInterSwap,
    chainNameInThirdParty:OPT.chainNameInThirdParty,
    eipId:OPT.eipId
  },
  AVAX: {
    rpcUrl: AVAX.RPC,
    chainId: AVAX.chainId,
    nativeChainKey: AVAX.nativeChainKey,
    minGasGwei: AVAX.minGasGwei,
    imageUrl: AVAX.imageUrl,
    name: AVAX.name,
    symbol: AVAX.symbol,
    chainName: AVAX.chainName,
    subName: AVAX.subName,
    gasLimit: AVAX.gasLimit,
    supportedTokenList: "https://raw.githubusercontent.com/sachin-swiftex/resources/master/avax_tokens.json",
    nativeToken: {
      "name": AVAX.name,
      "symbol": AVAX.symbol,
      "address": "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      "type": AVAX.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": AVAX.imageUrl
    },
    bridgeSupportTokens: AVAX.bridgeSupportTokens,
    sendEnable:true,
    receiveEnable:true,
    bridgeEnable:true,
    swapEnable:true,
    importForSetupApp:true,
    importForSetupedApp:true,
    supportedForInterSwap:AVAX.supportedForInterSwap,
    chainNameInThirdParty:AVAX.chainNameInThirdParty,
    eipId:AVAX.eipId
  },
  BASE: {
    rpcUrl: BASE.RPC,
    chainId: BASE.chainId,
    nativeChainKey: BASE.nativeChainKey,
    minGasGwei: BASE.minGasGwei,
    imageUrl: BASE.imageUrl,
    name: BASE.name,
    symbol: BASE.symbol,
    chainName: BASE.chainName,
    subName: BASE.subName,
    gasLimit: BASE.gasLimit,
    supportedTokenList: "https://raw.githubusercontent.com/sachin-swiftex/resources/master/base_tokens.json",
    nativeToken: {
      "name": BASE.name,
      "symbol": BASE.symbol,
      "address": "0x4200000000000000000000000000000000000006",
      "type": BASE.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": BASE.imageUrl
    },
    bridgeSupportTokens: BASE.bridgeSupportTokens,
    sendEnable:true,
    receiveEnable:true,
    bridgeEnable:true,
    swapEnable:true,
    importForSetupApp:true,
    importForSetupedApp:true,
    supportedForInterSwap:BASE.supportedForInterSwap,
    chainNameInThirdParty:BASE.chainNameInThirdParty,
    eipId:BASE.eipId
  },
  ETH: {
    rpcUrl: ETH.RPC,
    chainId: ETH.chainId,
    nativeChainKey: ETH.nativeChainKey,
    minGasGwei: ETH.minGasGwei,
    imageUrl: ETH.imageUrl,
    name: ETH.name,
    symbol: ETH.symbol,
    chainName: ETH.chainName,
    subName: ETH.subName,
    gasLimit: ETH.gasLimit,
    supportedTokenList: "https://raw.githubusercontent.com/sachin-swiftex/resources/master/eth_tokens.json",
    nativeToken: {
      "name": ETH.name,
      "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "symbol": ETH.symbol,
      "decimals": 18,
      "type": ETH.name?.toUpperCase(),
      "logoURI": ETH.imageUrl
    },
    bridgeSupportTokens: ETH.bridgeSupportTokens,
    sendEnable:true,
    receiveEnable:true,
    bridgeEnable:true,
    swapEnable:true,
    importForSetupApp:true,
    importForSetupedApp:true,
    supportedForInterSwap:ETH.supportedForInterSwap,
    chainNameInThirdParty:ETH.chainNameInThirdParty,
    eipId:ETH.eipId
  },
  BNB: {
    rpcUrl: BSC.RPC,
    chainId: BSC.chainId,
    nativeChainKey: BSC.nativeChainKey,
    minGasGwei: BSC.minGasGwei,
    imageUrl: BSC.imageUrl,
    name: BSC.name,
    symbol: BSC.symbol,
    chainName: BSC.chainName,
    subName: BSC.subName,
    gasLimit: BSC.gasLimit,
    supportedTokenList: "https://raw.githubusercontent.com/sachin-swiftex/resources/master/bsc_tokens.json",
    nativeToken: {
      "name": BSC.name,
      "symbol": BSC.symbol,
      "address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      "type": BSC.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": BSC.imageUrl
    },
    bridgeSupportTokens: BSC.bridgeSupportTokens,
    sendEnable:true,
    receiveEnable:true,
    bridgeEnable:true,
    swapEnable:true,
    importForSetupApp:true,
    importForSetupedApp:true,
    supportedForInterSwap:BSC.supportedForInterSwap,
    chainNameInThirdParty:BSC.chainNameInThirdParty,
    eipId:BSC.eipId
  },
  STR: {
    rpcUrl: STR.RPC,
    chainId: STR.chainId,
    nativeChainKey: STR.nativeChainKey,
    minGasGwei: STR.minGasGwei,
    imageUrl: STR.imageUrl,
    name: STR.name,
    symbol: STR.symbol,
    chainName: STR.chainName,
    subName: STR.subName,
    supportedTokenList: "https://raw.githubusercontent.com/sachin-swiftex/resources/master/stellar.json",
    nativeToken: {
      "name": "Stellar",
      "symbol": "XLM",
      "address": "0X0000000000000000000000000000000000000000",
      "type": STR.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": STR.imageUrl
    },
    bridgeSupportTokens: STR.bridgeSupportTokens,
    sendEnable:true,
    receiveEnable:true,
    bridgeEnable:true,
    swapEnable:true,
    importForSetupApp:true,
    importForSetupedApp:true,
    supportedForInterSwap:STR.supportedForInterSwap,
    chainNameInThirdParty:STR.chainNameInThirdParty,
    eipId:STR.eipId
  },
  DYDX: {
    rpcUrl: DYDX.RPC,
    chainId: DYDX.chainId,
    nativeChainKey: DYDX.nativeChainKey,
    minGasGwei: DYDX.minGasGwei,
    imageUrl: DYDX.imageUrl,
    name: DYDX.name,
    symbol: DYDX.symbol,
    chainName: DYDX.chainName,
    subName: DYDX.subName,
    supportedTokenList: [
      {
        name: DYDX.symbol,
        asset: DYDX.symbol,
        symbol: DYDX.symbol,
        address: "Native",
        chainId: DYDX.symbol,
        type: "NATIVE",
        decimals: 18,
        logoURI: DYDX.imageUrl
      },
      {
        name: 'USD Coin',
        asset: DYDX.symbol,
        symbol: 'USDC',
        address: 'USDC',
        chainId: DYDX.symbol,
        type: "",
        decimals: 6,
        logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
      }
    ],
    nativeToken: {
      "name": DYDX.symbol,
      "symbol": DYDX.symbol,
      "address": "",
      "type": DYDX.symbol,
      "decimals": 18,
      "logoURI": DYDX.imageUrl
    },
    bridgeSupportTokens: DYDX.bridgeSupportTokens,
    sendEnable: false,
    receiveEnable: true,
    bridgeEnable: false,
    swapEnable: false,
    importForSetupApp:false,
    importForSetupedApp:false,
    supportedForInterSwap:DYDX.supportedForInterSwap,
    chainNameInThirdParty:DYDX.chainNameInThirdParty,
    eipId:DYDX.eipId
  },
  BSC: {
    rpcUrl: BSC.RPC,
    chainId: BSC.chainId,
    nativeChainKey: BSC.nativeChainKey,
    minGasGwei: BSC.minGasGwei,
    imageUrl: BSC.imageUrl,
    name: BSC.name,
    symbol: BSC.symbol,
    chainName: BSC.chainName,
    subName: BSC.subName,
    gasLimit: BSC.gasLimit,
    supportedTokenList: "https://raw.githubusercontent.com/sachin-swiftex/resources/master/bsc_tokens.json",
    nativeToken: {
      "name": BSC.name,
      "symbol": BSC.symbol,
      "address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      "type": BSC.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": BSC.imageUrl
    },
    bridgeSupportTokens: BSC.bridgeSupportTokens,
    sendEnable:false,
    receiveEnable:false,
    bridgeEnable:false,
    swapEnable:false,
    importForSetupApp:false,
    importForSetupedApp:false,
    supportedForInterSwap:BSC.supportedForInterSwap,
    chainNameInThirdParty:BSC.chainNameInThirdParty,
    eipId:BSC.eipId
  },
};

export const CHAINTOCHARTID = {
  "ARB": "ETH",
  "MATIC": "POL",
  "POL": "POL",
  "OPT": "ETH",
  "AVAX": "AVAX",
  "BASE": "ETH",
  "ETH": "ETH",
  "BNB": "BNB",
  "STR": "XLM",
  "DYDX": "DYDX",
  "XLM":"XLM"
};
export const isNativeTokenAddress="0x0000000000000000000000000000000000000000";
export const NativeESCROWAddress="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

export const CheckTxStatus = async (txHash, chain) => {
  const baseUrl = PUBLIC_TX_CHEKER[chain];
  if (!baseUrl) return null;
  const res = await fetch(`${baseUrl}${txHash}`);
  const data = await res.json();
  if (data.status === "ok" || data.result === "success") {
    return { status: true, message: data.result, chain: chain , reqStatus:data.status };
  } else {
    return { status: false, message: data.result, chain: chain , reqStatus:data.status};
  }
};

export const TXSTATUS = {
  success: 'completed',
  processed: 'success',
  failed: 'failed',
  pending: 'pending',
  error:'error'
};

export const isBridgeTokenSupported = (chain, tokenId) => {
  const response = CHAINS[chain].bridgeSupportTokens.find(token => token.address?.toLowerCase() === tokenId?.toLowerCase());
  return response;
};

export const UI_CHAIN_NAME = {
  POL: "POL",
  ARB: "ETH",
  OPT: "ETH",
  AVA: "AVAX",
  BAS: "ETH",
  ETH: "ETH",
  BSC: "BNB",
  SRB: "SRB",
  DYDX: "DYDX"
};