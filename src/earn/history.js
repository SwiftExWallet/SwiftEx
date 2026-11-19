import {useEffect, useState} from 'react';
import {getEarnEnvironment} from './config';
import {getRpcWindow, fetchSharePricePoints} from './service';

const KEEP_MS = 8 * 24 * 60 * 60 * 1000;
const cacheKey = vaultId => `${getEarnEnvironment().network}_${vaultId}`;
const memCache = new Map();

const inflight = new Map();

async function loadHistory(vault) {
  const key = cacheKey(vault.id);
  const cache = memCache.get(key) || {scannedTo: 0, points: []};

  const {oldestLedger, latestLedger} = await getRpcWindow();
  const from = Math.max(oldestLedger, (cache.scannedTo || 0) + 1);
  let points = cache.points || [];
  let scannedTo = cache.scannedTo || 0;

  if (from <= latestLedger) {
    const res = await fetchSharePricePoints(vault, from);
    const seen = new Set(points.map(p => `${p.ledger}:${p.sp}`));
    points = points.concat(res.points.filter(p => !seen.has(`${p.ledger}:${p.sp}`)));
    scannedTo = res.scannedTo;
  }

  const cutoff = Date.now() - KEEP_MS;
  points = points.filter(p => p.ts >= cutoff).sort((a, b) => a.ts - b.ts);
  memCache.set(key, {scannedTo, points});
  return points;
}

export function useSharePriceHistory(vault) {
  const [state, setState] = useState({status: 'loading', points: []});
  const id = vault && vault.id;

  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    setState(s => ({...s, status: 'loading'}));
    let p = inflight.get(id);
    if (!p) {
      p = loadHistory(vault.config).finally(() => inflight.delete(id));
      inflight.set(id, p);
    }
    p.then(points => alive && setState({status: 'ready', points})).catch(e => {
      console.warn('[Earn] history failed', e && e.message);
      if (alive) setState({status: 'error', points: []});
    });
    return () => {
      alive = false;
    };
  }, [id]);

  return state;
}

export function buildSeries(points, currentSp, periodMs, buckets = 48) {
  const now = Date.now();
  const startWanted = now - periodMs;
  const before = points.filter(p => p.ts < startWanted);
  const inside = points.filter(p => p.ts >= startWanted);
  const startPoint = before.length ? {ts: startWanted, sp: before[before.length - 1].sp} : inside[0];
  if (!startPoint) return null;

  const all = [startPoint, ...inside, {ts: now, sp: currentSp}];
  const start = startPoint.ts;
  const span = Math.max(1, now - start);
  const data = [];
  let j = 0;
  for (let i = 0; i < buckets; i++) {
    const t = start + (span * i) / (buckets - 1);
    while (j + 1 < all.length && all[j + 1].ts <= t) j++;
    data.push(all[j].sp);
  }
  data[data.length - 1] = currentSp;
  return {data, start, end: now, first: startPoint.sp, last: currentSp, events: inside.length};
}
