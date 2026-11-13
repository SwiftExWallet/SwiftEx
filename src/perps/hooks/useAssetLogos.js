import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { asterFetch, PUBLIC_TIMEOUT_MS } from "../api/asterPublic";

// Coin logos for Perps, keyed by base asset (e.g. "BTC").
// Source: Aster's public asset-logo list (covers all USDT perps). Cached in AsyncStorage for 24h
// and loaded once per app session; every component shares the same in-memory map.

const LOGO_URL = "https://www.asterdex.com/bapi/futures/v1/public/future/asset/ae/all-asset-logo";
const STORAGE_KEY = "perps_asset_logos";
const TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000; // after a failed load, try again on next use (not more often)

// Fallback: the CoinGecko images the app already ships in the Discover seed list (Market.js).
const FALLBACK_LOGOS = {
  BTC: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400",
  ETH: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628",
  USDT: "https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661",
  BNB: "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970",
  XRP: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442",
  SOL: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756",
  USDC: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png?1696506694",
  STETH: "https://coin-images.coingecko.com/coins/images/13442/large/steth_logo.png?1696513206",
  TRX: "https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png?1696502193",
  DOGE: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409",
  ADA: "https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090",
  SOLID: "https://coin-images.coingecko.com/coins/images/68475/large/IMG_7008_2.png?1755845964",
  LINEA: "https://coin-images.coingecko.com/coins/images/68507/large/linea-logo.jpeg?1756025484",
  CYAI: "https://coin-images.coingecko.com/coins/images/70081/large/20251014_050308.jpg?1760521873",
  PAXG: "https://coin-images.coingecko.com/coins/images/70025/large/IMG_7998.webp?1760438148",
};

let logoMap = null; // { BTC: "https://..." }
let loading = null; // in-flight promise
let lastFailAt = 0;
const listeners = new Set();

const isHttps = (u) => typeof u === "string" && /^https:\/\//.test(u);

const toMap = (list) => {
  const map = {};
  (Array.isArray(list) ? list : []).forEach((x) => {
    const code = x && typeof x.assetCode === "string" ? x.assetCode.toUpperCase() : null;
    if (code && isHttps(x.logoUrl)) map[code] = x.logoUrl;
  });
  return map;
};

const publish = (map) => {
  logoMap = map;
  listeners.forEach((fn) => fn(map));
};

const loadLogos = () => {
  if (logoMap || loading) return loading;
  if (lastFailAt && Date.now() - lastFailAt < RETRY_AFTER_MS) return null;
  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.map && Date.now() - Number(cached.savedAt) < TTL_MS) {
          publish(cached.map);
          return;
        }
      }
    } catch (e) {
      // corrupt cache -> refetch below
    }
    const { data, error } = await asterFetch(LOGO_URL, { method: "POST", timeoutMs: PUBLIC_TIMEOUT_MS });
    const map = error ? {} : toMap(data && data.data);
    if (Object.keys(map).length) {
      publish(map);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), map })).catch(() => {});
    } else {
      lastFailAt = Date.now();
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
};

// Logo URL candidates for an asset, best first: Aster logo, then the app's CoinGecko image.
export const logoCandidates = (asset, map) => {
  const code = String(asset || "").toUpperCase();
  const out = [];
  if (map && map[code]) out.push(map[code]);
  if (FALLBACK_LOGOS[code]) out.push(FALLBACK_LOGOS[code]);
  return out;
};

export const useAssetLogos = () => {
  const [map, setMap] = useState(logoMap);
  useEffect(() => {
    listeners.add(setMap);
    if (logoMap) setMap(logoMap);
    else loadLogos();
    return () => {
      listeners.delete(setMap);
    };
  }, []);
  return map;
};
