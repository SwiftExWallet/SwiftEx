import * as StellarSdk from '@stellar/stellar-sdk/axios';
import {nativeSign} from '../utilities/NativeSign';
import {getEarnEnvironment} from './config';

const DECIMALS = 7;
const SCALE = 10n ** BigInt(DECIMALS);
const SLIPPAGE_BPS = 50n;
const BASE_FEE = '100000';

export function parseUnits(amount) {
  const clean = String(amount == null ? '' : amount).trim().replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(clean) || clean === '' || clean === '.') return 0n;
  const [whole = '0', frac = ''] = clean.split('.');
  return BigInt(whole || '0') * SCALE + BigInt((frac + '0'.repeat(DECIMALS)).slice(0, DECIMALS) || '0');
}

export const toNumber = stroops => Number(stroops) / Number(SCALE);

export const convertToAssets = (shares, totalAssets, totalShares) => {
  if (totalShares <= 0n || totalAssets <= 0n || shares <= 0n) return 0n;
  return (shares * totalAssets) / totalShares;
};

export const convertToShares = (assets, totalAssets, totalShares) => {
  if (assets <= 0n) return 0n;
  if (totalShares <= 0n || totalAssets <= 0n) return assets;
  return (assets * totalShares) / totalAssets;
};

const toBigInt = v => {
  try {
    return BigInt(v == null ? 0 : v.toString());
  } catch {
    return 0n;
  }
};

const servers = new Map();
const getRpc = () => {
  const {rpcUrl} = getEarnEnvironment();
  if (!rpcUrl) throw new Error('Soroban RPC URL missing for this network');
  let s = servers.get(rpcUrl);
  if (!s) {
    s = new StellarSdk.rpc.Server(rpcUrl);
    servers.set(rpcUrl, s);
  }
  return s;
};

async function simulateRead(contractId, method, args, sourceAddress) {
  const env = getEarnEnvironment();
  const tx = new StellarSdk.TransactionBuilder(new StellarSdk.Account(sourceAddress, '0'), {
    fee: '100',
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(new StellarSdk.Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await getRpc().simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationSuccess(sim) && sim.result) {
    return StellarSdk.scValToNative(sim.result.retval);
  }
  throw new Error(sim && sim.error ? String(sim.error) : `Simulation failed: ${method}`);
}


const ACTIVITY_LIMIT = 100;
const OPS_PAGE = 200;
const MAX_OPS_PAGES = 50;
const ledgerCache = new Map();
const ledgerInflight = new Map();

const decodeParam = p => {
  try {
    return StellarSdk.scValToNative(StellarSdk.xdr.ScVal.fromXDR(p.value, 'base64'));
  } catch {
    return undefined;
  }
};

const sumTransfers = (changes, asset, pred) => {
  let total = 0n;
  let found = false;
  for (const c of changes || []) {
    if (c.asset_code === asset.code && c.asset_issuer === asset.issuer && pred(c)) {
      total += parseUnits(c.amount);
      found = true;
    }
  }
  return found ? total : null;
};

function opToEntry(op, address, vaultsByAddress) {
  if (op.type !== 'invoke_host_function' || !Array.isArray(op.parameters) || op.parameters.length < 2) return null;
  const vault = vaultsByAddress.get(decodeParam(op.parameters[0]));
  if (!vault) return null;
  const fn = decodeParam(op.parameters[1]);
  if (fn !== 'deposit' && fn !== 'withdraw') return null;

  const asset = vault.underlyingAsset;
  let stroops;
  if (fn === 'deposit') {
    stroops = sumTransfers(op.asset_balance_changes, asset, c => c.from === address);
    if (stroops == null) {
      const desired = decodeParam(op.parameters[2]);
      stroops = Array.isArray(desired) && desired.length ? toBigInt(desired[0]) : 0n;
    }
  } else {
    stroops = sumTransfers(op.asset_balance_changes, asset, c => c.to === address);
    if (stroops == null) stroops = 0n;
  }

  return {
    id: op.id,
    type: fn,
    vaultId: vault.id,
    symbol: asset.symbol,
    stroops: stroops.toString(),
    amount: toNumber(stroops),
    hash: op.transaction_hash,
    date: op.created_at,
    status: 'Completed',
  };
}

async function fetchOpsPage(horizonUrl, address, {cursor, order}) {
  const qs = `limit=${OPS_PAGE}&order=${order}${cursor ? `&cursor=${cursor}` : ''}`;
  const res = await fetch(`${horizonUrl}/accounts/${address}/operations?${qs}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Horizon ${res.status}`);
  const json = await res.json();
  return (json && json._embedded && json._embedded.records) || [];
}

async function loadLedger(env, address, key) {
  const vaultsByAddress = new Map(env.vaults.map(v => [v.vaultAddress, v]));
  const cached = ledgerCache.get(key);
  const fresh = [];
  let newestToken = cached ? cached.newestToken : null;

  if (cached) {
    let cursor = cached.newestToken;
    for (let page = 0; page < MAX_OPS_PAGES; page++) {
      const ops = await fetchOpsPage(env.horizonUrl, address, {cursor, order: 'asc'});
      for (const op of ops) {
        const e = opToEntry(op, address, vaultsByAddress);
        if (e) fresh.push(e);
        cursor = op.paging_token;
      }
      newestToken = cursor;
      if (ops.length < OPS_PAGE) break;
    }
  } else {
    let cursor;
    for (let page = 0; page < MAX_OPS_PAGES; page++) {
      const ops = await fetchOpsPage(env.horizonUrl, address, {cursor, order: 'desc'});
      if (page === 0 && ops.length) newestToken = ops[0].paging_token;
      for (const op of ops) {
        const e = opToEntry(op, address, vaultsByAddress);
        if (e) fresh.unshift(e);
        cursor = op.paging_token;
      }
      if (ops.length < OPS_PAGE) break;
    }
  }

  const seen = new Set();
  const items = [...(cached ? cached.items : []), ...fresh].filter(e =>
    seen.has(e.id) ? false : (seen.add(e.id), true),
  );
  const next = {items, newestToken};
  ledgerCache.set(key, next);
  return next;
}

async function getLedger(address) {
  const env = getEarnEnvironment();
  if (!address || !env.horizonUrl || !env.vaults.length) return {items: [], ok: false};
  const key = `${env.network}_${address}`;
  let p = ledgerInflight.get(key);
  if (!p) {
    p = loadLedger(env, address, key).finally(() => ledgerInflight.delete(key));
    ledgerInflight.set(key, p);
  }
  try {
    const {items} = await p;
    return {items, ok: true};
  } catch (e) {
    console.warn('[Earn] ledger fetch failed', e && e.message);
    const cached = ledgerCache.get(key);
    return cached ? {items: cached.items, ok: true} : {items: [], ok: false};
  }
}

export async function getActivity(address) {
  const {items} = await getLedger(address);
  return items.slice(-ACTIVITY_LIMIT).reverse();
}

async function getPrincipalFromChain(vaultId, address) {
  const {items, ok} = await getLedger(address);
  if (!ok) return {principal: null, since: null};
  let principal = 0n;
  let since = null;
  for (const e of items) {
    if (e.vaultId !== vaultId) continue;
    const amt = toBigInt(e.stroops);
    if (e.type === 'deposit') {
      if (principal <= 0n) since = e.date;
      principal += amt;
    } else {
      principal -= amt;
      if (principal <= 0n) {
        principal = 0n;
        since = null;
      }
    }
  }
  return {principal, since};
}

export async function fetchVaultMetrics(vault) {
  let totalAssets = 0n;
  let totalShares = 0n;
  let idleAmount = 0n;
  let investedAmount = 0n;
  let feeBps = 0;
  const src = vault.vaultManager || (vault.roles && vault.roles.vaultManager);

  const [funds, supply, fees] = await Promise.allSettled([
    simulateRead(vault.vaultAddress, 'fetch_total_managed_funds', [], src),
    simulateRead(vault.vaultAddress, 'total_supply', [], src),
    simulateRead(vault.vaultAddress, 'get_fees', [], src),
  ]);

  if (funds.status === 'fulfilled' && Array.isArray(funds.value) && funds.value.length) {
    const item = funds.value[0];
    totalAssets = toBigInt(item.total_amount);
    idleAmount = toBigInt(item.idle_amount);
    investedAmount = toBigInt(item.invested_amount);
  }
  if (supply.status === 'fulfilled') totalShares = toBigInt(supply.value);
  if (fees.status === 'fulfilled') {
    const f = fees.value;
    feeBps = Number(Array.isArray(f) ? f[0] : f) || 0;
  }
  if (funds.status === 'rejected' && supply.status === 'rejected') {
    throw new Error('Vault contract unreachable');
  }

  const sharePrice = totalShares > 0n && totalAssets > 0n ? Number(totalAssets) / Number(totalShares) : 1;
  const realizedApyPercent =
    sharePrice > 1 && sharePrice <= 2 ? (sharePrice - 1) * 100 : vault.targetApyPercent;
  const utilizationPercent = totalAssets > 0n ? (Number(investedAmount) / Number(totalAssets)) * 100 : 0;

  return {
    totalAssets,
    totalShares,
    idleAmount,
    investedAmount,
    sharePrice,
    realizedApyPercent,
    utilizationPercent,
    feeBps,
    lastUpdated: Date.now(),
  };
}

export async function fetchUserPosition(vault, address, metrics) {
  let shares = 0n;
  try {
    shares = toBigInt(
      await simulateRead(vault.vaultAddress, 'balance', [new StellarSdk.Address(address).toScVal()], address),
    );
  } catch (e) {
    console.warn('[Earn] share balance failed', vault.id, e && e.message);
  }
  const underlying = convertToAssets(shares, metrics.totalAssets, metrics.totalShares);

  const chain = await getPrincipalFromChain(vault.id, address);
  let principal = chain.principal;
  if (principal == null) principal = shares > 0n ? shares : 0n;
  if (shares === 0n) principal = 0n;

  let accrued = 0n;
  if (underlying > principal && principal > 0n) accrued = underlying - principal;

  const since = shares > 0n ? chain.since : null;

  return {
    shares,
    underlying,
    principal,
    accrued,
    poolSharePercent: metrics.totalShares > 0n ? (Number(shares) / Number(metrics.totalShares)) * 100 : 0,
    since,
  };
}

export async function fetchWalletBalance(vault, address) {
  try {
    return toBigInt(
      await simulateRead(
        vault.underlyingAsset.contractId,
        'balance',
        [new StellarSdk.Address(address).toScVal()],
        address,
      ),
    );
  } catch {
    return 0n;
  }
}

const VAULT_TOPIC = () => StellarSdk.nativeToScVal('DeFindexVault', {type: 'string'}).toXDR('base64');
const cursorLedger = cursor => {
  try {
    return Number(BigInt(String(cursor).split('-')[0]) >> 32n);
  } catch {
    return 0;
  }
};

export async function getRpcWindow() {
  const h = await getRpc().getHealth();
  return {oldestLedger: h.oldestLedger, latestLedger: h.latestLedger};
}

export async function fetchSharePricePoints(vault, fromLedger, maxPages = 60) {
  const rpc = getRpc();
  const filters = [{type: 'contract', contractIds: [vault.vaultAddress], topics: [[VAULT_TOPIC(), '*']]}];
  const points = [];
  let res = await rpc.getEvents({startLedger: fromLedger, filters, limit: 200});
  let latest = res.latestLedger;
  for (let page = 0; ; page++) {
    for (const e of res.events) {
      try {
        const v = StellarSdk.scValToNative(e.value);
        const funds = v && v.total_managed_funds_before;
        const supply = toBigInt(v && v.total_supply_before);
        if (!Array.isArray(funds) || !funds.length || supply <= 0n) continue;
        const total = toBigInt(funds[0].total_amount);
        if (total <= 0n) continue;
        points.push({ts: Date.parse(e.ledgerClosedAt), sp: Number(total) / Number(supply), ledger: e.ledger});
      } catch {
      }
    }
    latest = res.latestLedger || latest;
    if (!res.cursor || cursorLedger(res.cursor) >= latest - 1 || page >= maxPages) break;
    res = await rpc.getEvents({cursor: res.cursor, filters, limit: 200});
  }
  return {points, scannedTo: latest};
}

async function loadAccount(address) {
  try {
    return await getRpc().getAccount(address);
  } catch {
    throw new Error('Your Stellar account is not activated on this network. Fund it with XLM first.');
  }
}

const feeXlm = tx => Number(tx.fee) / 1e7;

export async function buildDeposit(vault, address, amountStroops) {
  if (amountStroops <= 0n) throw new Error('Enter a valid amount.');
  const env = getEarnEnvironment();
  const [account, metrics] = await Promise.all([loadAccount(address), fetchVaultMetrics(vault)]);
  const expectedShares = convertToShares(amountStroops, metrics.totalAssets, metrics.totalShares);
  const minShares = (expectedShares * (10000n - SLIPPAGE_BPS)) / 10000n;

  const raw = new StellarSdk.TransactionBuilder(account, {fee: BASE_FEE, networkPassphrase: env.networkPassphrase})
    .addOperation(
      new StellarSdk.Contract(vault.vaultAddress).call(
        'deposit',
        StellarSdk.xdr.ScVal.scvVec([StellarSdk.nativeToScVal(amountStroops, {type: 'i128'})]),
        StellarSdk.xdr.ScVal.scvVec([StellarSdk.nativeToScVal(minShares, {type: 'i128'})]),
        new StellarSdk.Address(address).toScVal(),
        StellarSdk.xdr.ScVal.scvBool(false),
      ),
    )
    .setTimeout(300)
    .build();
  const prepared = await getRpc().prepareTransaction(raw);
  return {xdr: prepared.toXDR(), feeXlm: feeXlm(prepared), expectedShares, builtAt: Date.now()};
}

export async function buildWithdraw(vault, address, amountStroops, {all = false} = {}) {
  const env = getEarnEnvironment();
  const [account, metrics] = await Promise.all([loadAccount(address), fetchVaultMetrics(vault)]);
  const pos = await fetchUserPosition(vault, address, metrics);
  if (pos.shares <= 0n) throw new Error('You have no shares in this vault.');

  let shares = all ? pos.shares : convertToShares(amountStroops, metrics.totalAssets, metrics.totalShares);
  if (shares > pos.shares) shares = pos.shares;
  if (shares <= 0n) throw new Error('Enter a valid amount.');

  const expectedAssets = convertToAssets(shares, metrics.totalAssets, metrics.totalShares);
  const minAssets = (expectedAssets * (10000n - SLIPPAGE_BPS)) / 10000n;

  const raw = new StellarSdk.TransactionBuilder(account, {fee: BASE_FEE, networkPassphrase: env.networkPassphrase})
    .addOperation(
      new StellarSdk.Contract(vault.vaultAddress).call(
        'withdraw',
        StellarSdk.nativeToScVal(shares, {type: 'i128'}),
        StellarSdk.xdr.ScVal.scvVec([StellarSdk.nativeToScVal(minAssets, {type: 'i128'})]),
        new StellarSdk.Address(address).toScVal(),
      ),
    )
    .setTimeout(300)
    .build();
  const prepared = await getRpc().prepareTransaction(raw);
  return {
    xdr: prepared.toXDR(),
    feeXlm: feeXlm(prepared),
    shares,
    userShares: pos.shares,
    expectedAssets,
    builtAt: Date.now(),
  };
}

export async function signXdr(xdr) {
  const {signerNetwork} = getEarnEnvironment();
  const res = await nativeSign({type: 'stellar_xdr', xdr, network: signerNetwork});
  if (!res || typeof res.signedXDR !== 'string') throw new Error('Invalid signed XDR');
  return res.signedXDR;
}

export async function submitSigned(signedXdr) {
  const env = getEarnEnvironment();
  const tx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, env.networkPassphrase);
  const res = await getRpc().sendTransaction(tx);
  if (res.status === 'ERROR' || res.status === 'TRY_AGAIN_LATER') {
    const name =
      res.errorResult && res.errorResult.result && res.errorResult.result().switch
        ? res.errorResult.result().switch().name
        : null;
    throw new Error(name || (res.status === 'TRY_AGAIN_LATER' ? 'Network busy, try again.' : 'Transaction rejected by Soroban RPC'));
  }
  return res.hash;
}

export async function waitForTx(hash, maxAttempts = 30) {
  const rpc = getRpc();
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1500));
    let res;
    try {
      res = await rpc.getTransaction(hash);
    } catch {
      continue;
    }
    if (res.status === 'SUCCESS') return res;
    if (res.status === 'FAILED') throw new Error('Transaction failed on-chain.');
  }
  throw new Error('Confirmation timed out. Check the transaction on Stellar Expert.');
}

export function humanError(err, mode) {
  const raw = (err && err.message) || String(err);
  if (/cancel|reject|denied|USER_CANCEL|authentication/i.test(raw)) return 'Transaction was cancelled.';
  if (mode === 'deposit' && (/#13\b/.test(raw) || /balance/i.test(raw))) return 'Insufficient USDC balance in your wallet.';
  if (/trustline/i.test(raw)) return 'Add a USDC trustline to your wallet first.';
  if (/liquidity/i.test(raw)) return 'Pool liquidity is constrained right now. Try a smaller amount.';
  return raw;
}
