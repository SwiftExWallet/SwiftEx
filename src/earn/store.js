import {useEffect, useState} from 'react';
import {useSelector} from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getEarnEnvironment} from './config';
import {fetchVaultMetrics, fetchUserPosition, fetchWalletBalance, getActivity, toNumber} from './service';

const REFRESH_MS = 20000;

const LEGACY_PREFIXES = ['earn_activity_', 'earn_principal_', 'earn_since_', 'earn_hist_'];
AsyncStorage.getAllKeys()
  .then(keys => {
    const old = (keys || []).filter(k => LEGACY_PREFIXES.some(p => k.startsWith(p)));
    return old.length ? AsyncStorage.multiRemove(old) : null;
  })
  .catch(() => {});

function toUiVault(cfg, m) {
  const price = cfg.underlyingAsset.oraclePriceUsd;
  const apy = m && m.realizedApyPercent > 0 ? m.realizedApyPercent : cfg.targetApyPercent;
  return {
    id: cfg.id,
    config: cfg,
    symbol: cfg.underlyingAsset.symbol,
    shareSymbol: cfg.shareSymbol,
    name: cfg.name,
    description: cfg.description,
    poolLabel: cfg.poolLabel,
    strategyName: cfg.strategyName,
    protocol: cfg.underlyingProtocol,
    strategy: `${cfg.strategyName} · ${cfg.underlyingProtocol}`,
    apy,
    targetApy: cfg.targetApyPercent,
    tvl: m ? toNumber(m.totalAssets) * price : 0,
    tvlUnits: m ? toNumber(m.totalAssets) : 0,
    idle: m ? toNumber(m.idleAmount) : 0,
    invested: m ? toNumber(m.investedAmount) : 0,
    totalShares: m ? toNumber(m.totalShares) : 0,
    utilization: m ? m.utilizationPercent : 0,
    sharePrice: m ? m.sharePrice : 1,
    feeBps: m ? m.feeBps : 0,
    price,
    live: !!m,
  };
}

const fmtDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
};

let state = {
  status: 'loading',
  error: null,
  address: '',
  network: getEarnEnvironment().network,
  vaults: getEarnEnvironment().vaults.map(c => toUiVault(c, null)),
  positions: [],
  wallet: {},
  activity: [],
  lastUpdated: 0,
};
const listeners = new Set();
const setState = patch => {
  state = {...state, ...patch};
  listeners.forEach(l => l(state));
};
export const getState = () => state;

let inflight = null;
let reqId = 0;

export function refresh(address = state.address) {
  const my = ++reqId;
  const env = getEarnEnvironment();
  const addressChanged = address !== state.address;
  setState({
    address,
    network: env.network,
    status: state.lastUpdated && !addressChanged ? state.status : 'loading',
    error: null,
    ...(addressChanged ? {positions: [], wallet: {}, activity: []} : null),
  });

  inflight = (async () => {
    try {
      const results = await Promise.all(
        env.vaults.map(async cfg => {
          let metrics = null;
          try {
            metrics = await fetchVaultMetrics(cfg);
          } catch (e) {
            console.warn('[Earn] metrics failed', cfg.id, e && e.message);
          }
          let position = null;
          let balance = 0n;
          if (address && metrics) {
            [position, balance] = await Promise.all([
              fetchUserPosition(cfg, address, metrics),
              fetchWalletBalance(cfg, address),
            ]);
          } else if (address) {
            balance = await fetchWalletBalance(cfg, address);
          }
          return {cfg, metrics, position, balance};
        }),
      );
      const activity = await getActivity(address);
      if (my !== reqId) return;

      const anyLive = results.some(r => r.metrics);
      setState({
        status: env.vaults.length && !anyLive ? 'error' : 'ready',
        error: env.vaults.length && !anyLive ? 'Could not reach the vault contracts.' : null,
        vaults: results.map(r => toUiVault(r.cfg, r.metrics)),
        positions: results
          .filter(r => r.position && r.position.shares > 0n)
          .map(r => ({
            id: r.cfg.id,
            vaultId: r.cfg.id,
            principal: toNumber(r.position.principal),
            earnings: toNumber(r.position.accrued),
            value: toNumber(r.position.underlying),
            shares: toNumber(r.position.shares),
            poolSharePercent: r.position.poolSharePercent,
            depositedOn: fmtDate(r.position.since),
          })),
        wallet: Object.fromEntries(results.map(r => [r.cfg.id, toNumber(r.balance)])),
        activity: activity.map(a => ({...a, date: fmtDate(a.date)})),
        lastUpdated: Date.now(),
      });
    } catch (e) {
      if (my !== reqId) return;
      setState({status: 'error', error: (e && e.message) || 'Failed to load Earn data'});
    } finally {
      if (my === reqId) inflight = null;
    }
  })();
  return inflight;
}

let mounted = 0;
let timer = null;

export function useVaultStore() {
  const address = useSelector(s => (s && s.STELLAR_PUBLICK_KEY) || '');
  const [s, set] = useState(state);

  useEffect(() => {
    listeners.add(set);
    mounted += 1;
    if (!timer) timer = setInterval(() => refresh(), REFRESH_MS);
    return () => {
      listeners.delete(set);
      mounted -= 1;
      if (mounted <= 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  useEffect(() => {
    if (address !== state.address || !state.lastUpdated) refresh(address);
  }, [address]);

  return {...s, address, refresh: () => refresh(address)};
}

export function useEarnPositionCount() {
  const address = useSelector(s => (s && s.STELLAR_PUBLICK_KEY) || '');
  const [count, setCount] = useState(state.address === address ? state.positions.length : 0);

  useEffect(() => {
    const l = st => setCount(st.address === address ? st.positions.length : 0);
    listeners.add(l);
    l(state);
    if (address && (address !== state.address || !state.lastUpdated) && !inflight) refresh(address);
    return () => {
      listeners.delete(l);
    };
  }, [address]);

  return count;
}

export const getVault = id => state.vaults.find(v => v.id === id) || state.vaults[0];

export const getPosition = id => state.positions.find(p => p.id === id);

export const positionValue = p => (p ? p.value : 0);
