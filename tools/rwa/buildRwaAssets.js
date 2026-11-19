#!/usr/bin/env node
/*
 * Maintenance script: builds src/rwa/data/rwaAssets.json (curated RWA token list).
 *
 * Run from the repo root with plain Node 22 (no npm packages, uses global fetch):
 *   ~/.nvm/versions/node/v22.23.5/bin/node tools/rwa/buildRwaAssets.js
 *
 * Sources (read-only GET requests + eth_call; nothing is signed or sent):
 *   - Ondo Stocks: CSV linked from https://docs.ondo.finance/addresses (Dropbox)
 *   - xStocks:     https://api.backed.fi/api/v1/token
 *   - Gold:        PAXG + XAUt (hard-coded, verified on-chain below)
 *   - Stellar:     USDY (Ondo) + CETES (Etherfuse) (hard-coded, checked on Horizon)
 * Every EVM address is checked on-chain (symbol() + decimals()); mismatches are dropped.
 *
 * Not bundled into the app (lives in tools/, outside src/, and is only run by hand).
 */

const fs = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', '..', 'src', 'rwa', 'data', 'rwaAssets.json');

const ONDO_DOCS_MD = 'https://docs.ondo.finance/addresses.md';
// Fallback if the docs page can't be parsed. dl=1 makes Dropbox return the raw file.
const ONDO_CSV_FALLBACK =
  'https://www.dropbox.com/scl/fi/qjfxyg748mx0dwi6up86d/EXTERNAL-Ondo-GM-Tokens-Ondo-GM-Tokens.csv?rlkey=n3no1w78wrah3umsl0nr9s77i&dl=1';
const XSTOCKS_API = 'https://api.backed.fi/api/v1/token';
const XSTOCKS_V2 = 'https://api.xstocks.fi/api/v2/public';
// Trust Wallet token-assets repo (same source the app already uses for token icons).
const TRUSTWALLET_ETH = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets';
const HORIZON = 'https://horizon.stellar.org';

const RPC = {
  ETH: ['https://ethereum-rpc.publicnode.com'],
  // publicnode first: bsc-dataseed rate-limits batches above ~20 calls.
  BSC: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org'],
};
const CHAIN_ID = { ETH: 1, BSC: 56, XLM: null };
const CALLS_PER_BATCH = 50; // JSON-RPC calls per HTTP request (2 per token)
const BATCH_DELAY_MS = 300;

// xStocks marked isTradingHalted are left out (flip to true to keep them).
const INCLUDE_HALTED_XSTOCKS = false;

const ONDO_ORACLE = {
  ETH: '0x9BC39DB6fbB44B91a48b8D5A6C208B82B1741bE6',
  BSC: '0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e',
};

const TERMS = {
  ondo: 'https://docs.ondo.finance/ondo-stocks/eligibility',
  xstocks: 'https://xstocks.fi/documents/xstocks-terms-of-service.pdf',
  paxos: 'https://www.paxos.com/terms-and-conditions/general-terms-and-conditions',
  tether: 'https://gold.tether.to/legal',
  'ondo-stellar': 'https://ondo.finance/usdy',
  // etherfuse.com is the marketing homepage; this is its real Terms & Conditions page.
  etherfuse: 'https://etherfuse.com/legal/terms-and-conditions',
};

const CATEGORY_ORDER = { stock: 0, etf: 1, gold: 2, treasury: 3 };
const CHAIN_ORDER = { ETH: 0, BSC: 1, XLM: 2 };

const SEL_DECIMALS = '0x313ce567';
const SEL_SYMBOL = '0x95d89b41';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dropped = []; // { id, reason }

// ---------------------------------------------------------------- helpers

async function httpGet(url, asText = true) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'curl/8.5.0', Accept: '*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return asText ? await res.text() : await res.json();
    } catch (e) {
      if (attempt === 3) throw new Error(`GET ${url} failed: ${e.message}`);
      await sleep(1000 * attempt);
    }
  }
}

// Minimal RFC-4180 CSV parser (quoted fields, "" escapes, newlines inside quotes).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

const isEvmAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || '');
const httpsOrNull = (u) => (u && /^https:\/\/\S+$/.test(u) ? u : null);

function makeEntry(o) {
  // Fixed field order = the documented entry shape.
  return {
    id: o.id,
    symbol: o.symbol,
    name: o.name,
    underlying: o.underlying,
    issuer: o.issuer,
    category: o.category,
    chain: o.chain,
    chainId: CHAIN_ID[o.chain],
    address: o.address ? o.address.toLowerCase() : null,
    code: o.code || null,
    stellarIssuer: o.stellarIssuer || null,
    decimals: o.decimals,
    logo: httpsOrNull(o.logo),
    multiplier: o.multiplier,
    marketHours: o.marketHours,
    termsUrl: TERMS[o.issuer],
    regions: o.regions,
    // Listing country of the underlying (ISO-2, e.g. "US", "DE"); null = not a listed security (gold, treasuries).
    market: o.market || null,
  };
}

// ---------------------------------------------------------------- Ondo

async function findOndoCsvUrl() {
  try {
    const md = await httpGet(ONDO_DOCS_MD);
    const m = md.match(/https:\/\/www\.dropbox\.com\/[^\s)"'<>]*EXTERNAL-Ondo-GM-Tokens[^\s)"'<>]*/);
    if (m) {
      const u = new URL(m[0].replace(/\\&/g, '&'));
      u.searchParams.delete('e');
      u.searchParams.delete('st');
      u.searchParams.set('dl', '1'); // docs link uses dl=0 (preview page); dl=1 = raw file
      return { url: u.toString(), from: 'docs page' };
    }
  } catch (e) {
    console.warn(`  ! could not read ${ONDO_DOCS_MD}: ${e.message}`);
  }
  return { url: ONDO_CSV_FALLBACK, from: 'hard-coded fallback' };
}

async function loadOndo() {
  const { url, from } = await findOndoCsvUrl();
  console.log(`Ondo CSV (${from}): ${url}`);
  const text = await httpGet(url);
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Ondo CSV link returned HTML, not CSV');
  const rows = parseCsv(text);
  const typeCounts = {};
  rows.forEach((r) => (typeCounts[r.Type] = (typeCounts[r.Type] || 0) + 1));
  console.log(`  ${rows.length} rows, types: ${JSON.stringify(typeCounts)}`);

  const out = [];
  const etfTickers = new Set();
  let skipped = 0;
  for (const r of rows) {
    const type = (r.Type || '').toLowerCase();
    const category = type === 'stock' ? 'stock' : type === 'etf' ? 'etf' : null;
    if (!category) {
      skipped++;
      continue; // Portfolio, Currency (USDon), anything else
    }
    const ticker = r['Stock Ticker'];
    if (category === 'etf' && ticker) etfTickers.add(ticker.toUpperCase());
    const baseName = r['Stock Name'] || r.Name.replace(/\s*\(Ondo Tokenized\)\s*$/i, '');
    for (const [chain, col] of [
      ['ETH', 'Ethereum Deployed Address'],
      ['BSC', 'BSC Deployed Address'],
    ]) {
      const address = r[col];
      const id = `${r.Symbol}-${chain}`;
      if (!isEvmAddress(address)) {
        if (address) dropped.push({ id, reason: `invalid address in CSV: ${address}` });
        continue;
      }
      out.push(
        makeEntry({
          id,
          symbol: r.Symbol,
          name: `${baseName} (Ondo)`,
          underlying: ticker && ticker !== '-' ? ticker : null,
          issuer: 'ondo',
          category,
          chain,
          address,
          decimals: 18,
          logo: r['Link to image (png)'] || r['Link to image (svg)'],
          multiplier: { kind: 'ondo-svalue', oracle: ONDO_ORACLE[chain].toLowerCase() },
          marketHours: 'ondo-24-5',
          regions: 'ondo',
          market: 'US', // Ondo Global Markets = US-listed stocks and ETFs
        }),
      );
    }
  }
  console.log(`  -> ${out.length} Ondo entries (skipped ${skipped} portfolio/currency rows)`);
  return { entries: out, etfTickers };
}

// ---------------------------------------------------------------- xStocks

// The xStocks API has no stock/ETF field, so ETFs are detected by name
// plus Ondo's ETF ticker list.
const XSTOCKS_ETF_NAME =
  /\b(ETF|ETC|ETN)\b|\biShares\b|\bSPDR\b|\bVanguard\b|\bProShares\b|\bDirexion\b|\bGraniteShares\b|\bLeverage Shares\b|\bGlobal X\b|\bVanEck\b|\bRoundhill\b|\bKraneShares\b|\bSprott\b|\bWisdomTree\b|\bInvesco QQQ\b|\bUnited States Oil Fund\b|\bXetra-Gold\b|\bVolatility Shares\b|\bT-REX\b|\bFranklin U\.S\./i;
// Fund tickers whose xStocks names don't say "ETF" (e.g. "S&P Small Cap" = IJR).
const XSTOCKS_ETF_TICKERS = new Set([
  'IJR', 'JPST', 'DIA', 'IVV', 'EEM', 'EFA', 'AGG', 'BND', 'HYG', 'LQD', 'TBIL', 'IBIT', 'ETHA',
  'GBTC', 'ARKK', 'SCHD', 'JEPI', 'JEPQ', 'VYM', 'XLK', 'XLF', 'XLV', 'BIL', 'SHV', 'IEF',
]);

// xStocks v2 public API: listing country of each underlying (underlying.exchange.country).
// 100 per page (API maximum).
async function loadXStocksCountries() {
  const out = new Map();
  for (let page = 0; page < 50; page += 1) {
    const j = await httpGet(`${XSTOCKS_V2}/assets?page=${page}&pageSize=100`, false);
    (j.nodes || []).forEach((n) => {
      const c = n.underlying && n.underlying.exchange && n.underlying.exchange.country;
      if (n.symbol) out.set(n.symbol, c ? String(c).toUpperCase() : null);
    });
    if (!j.page || !j.page.hasNextPage) break;
    await sleep(150);
  }
  console.log(`  xStocks v2: listing country for ${out.size} products`);
  return out;
}

async function loadXStocks(ondoEtfTickers) {
  console.log(`xStocks API: ${XSTOCKS_API}`);
  const countries = await loadXStocksCountries();
  const json = await httpGet(XSTOCKS_API, false);
  const nodes = json.nodes || [];
  if (json.page && json.page.hasNextPage) console.warn('  ! API says more pages exist; only page 0 used');
  console.log(`  ${nodes.length} products`);

  const out = [];
  const skippedLegacy = [];
  const skippedHalted = [];
  for (const n of nodes) {
    // Legacy "Backed" bTokens (bIB01, bCSPX, ...) are not xStocks products.
    if (!/x$/.test(n.symbol)) {
      skippedLegacy.push(n.symbol);
      continue;
    }
    if (n.isTradingHalted && !INCLUDE_HALTED_XSTOCKS) {
      skippedHalted.push(n.symbol);
      continue;
    }
    const underlying = n.underlyingSymbol || null;
    const isEtf =
      XSTOCKS_ETF_NAME.test(n.name || '') ||
      (underlying &&
        (ondoEtfTickers.has(underlying.toUpperCase()) || XSTOCKS_ETF_TICKERS.has(underlying.toUpperCase())));
    const name = `${(n.name || n.symbol).replace(/\s*xStock\s*$/i, '')} (xStocks)`;
    for (const [chain, network] of [
      ['ETH', 'Ethereum'],
      ['BSC', 'BinanceSmartChain'],
    ]) {
      const dep = (n.deployments || []).find((d) => d.network === network);
      if (!dep) continue;
      const id = `${n.symbol}-${chain}`;
      if (!isEvmAddress(dep.address)) {
        dropped.push({ id, reason: `invalid address in API: ${dep.address}` });
        continue;
      }
      out.push(
        makeEntry({
          id,
          symbol: n.symbol,
          name,
          underlying,
          issuer: 'xstocks',
          category: isEtf ? 'etf' : 'stock',
          chain,
          address: dep.address, // plain token, NOT wrapperAddressV2
          decimals: 18,
          logo: n.logo,
          multiplier: { kind: 'xstocks-rebase', oracle: null },
          marketHours: 'xstocks',
          regions: 'xstocks',
          // Unknown country: treat as non-US ("ZZ") so it stays out of the US default view.
          market: countries.get(n.symbol) || 'ZZ',
        }),
      );
    }
  }
  console.log(`  skipped legacy Backed tokens (${skippedLegacy.length}): ${skippedLegacy.join(' ')}`);
  console.log(`  skipped halted xStocks (${skippedHalted.length}): ${skippedHalted.join(' ')}`);
  console.log(`  -> ${out.length} xStocks entries`);
  return out;
}

// ---------------------------------------------------------------- gold + Stellar

function goldEntries() {
  const none = { kind: 'none', oracle: null };
  return [
    makeEntry({
      id: 'PAXG-ETH', symbol: 'PAXG', name: 'PAX Gold', underlying: 'XAU', issuer: 'paxos',
      category: 'gold', chain: 'ETH', address: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
      decimals: 18, logo: `${TRUSTWALLET_ETH}/0x45804880De22913dAFE09f4980848ECE6EcbAf78/logo.png`,
      multiplier: none, marketHours: '24-7', regions: 'paxos',
    }),
    makeEntry({
      id: 'XAUt-ETH', symbol: 'XAUt', name: 'Tether Gold', underlying: 'XAU', issuer: 'tether',
      category: 'gold', chain: 'ETH', address: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
      decimals: 6, logo: `${TRUSTWALLET_ETH}/0x68749665FF8D2d112Fa859AA293F07A622782F38/logo.png`,
      multiplier: none, marketHours: '24-7', regions: 'tether',
    }),
  ];
}

async function stellarEntries() {
  const none = { kind: 'none', oracle: null };
  const list = [
    makeEntry({
      id: 'USDY-XLM', symbol: 'USDY', name: 'Ondo US Dollar Yield', underlying: 'USD-TBILLS',
      issuer: 'ondo-stellar', category: 'treasury', chain: 'XLM', address: null, code: 'USDY',
      stellarIssuer: 'GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6', decimals: 7,
      logo: 'https://cdn.ondo.finance/tokens/logos/usdy_160x160.png', multiplier: none,
      marketHours: '24-7', regions: 'stellar-ondo',
    }),
    makeEntry({
      id: 'CETES-XLM', symbol: 'CETES', name: 'Etherfuse CETES', underlying: 'MX-CETES',
      issuer: 'etherfuse', category: 'treasury', chain: 'XLM', address: null, code: 'CETES',
      stellarIssuer: 'GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC', decimals: 7,
      logo: 'https://raw.githubusercontent.com/sachin-swiftex/resources/refs/heads/master/stellar/cetes.png',
      multiplier: none, marketHours: '24-7', regions: 'etherfuse',
    }),
  ];
  const kept = [];
  for (const e of list) {
    try {
      const j = await httpGet(
        `${HORIZON}/assets?asset_code=${e.code}&asset_issuer=${e.stellarIssuer}`,
        false,
      );
      if (j._embedded && j._embedded.records && j._embedded.records.length) kept.push(e);
      else dropped.push({ id: e.id, reason: 'asset not found on Horizon' });
    } catch (err) {
      dropped.push({ id: e.id, reason: `Horizon check failed: ${err.message}` });
    }
  }
  return kept;
}

// ---------------------------------------------------------------- on-chain validation

function decodeUint(hex) {
  if (!hex || hex === '0x') return null;
  try {
    return Number(BigInt(hex.length > 66 ? hex.slice(0, 66) : hex));
  } catch {
    return null;
  }
}

function decodeString(hex) {
  if (!hex || hex === '0x') return null;
  const h = hex.slice(2);
  try {
    if (h.length >= 128) {
      const off = Number(BigInt('0x' + h.slice(0, 64)));
      const len = Number(BigInt('0x' + h.slice(off * 2, off * 2 + 64)));
      if (off === 32 && len <= 256) {
        const data = h.slice(off * 2 + 64, off * 2 + 64 + len * 2);
        return Buffer.from(data, 'hex').toString('utf8');
      }
    }
    if (h.length === 64) return Buffer.from(h, 'hex').toString('utf8').replace(/\0+$/, ''); // bytes32
  } catch {
    /* fall through */
  }
  return null;
}

async function rpcBatch(chain, calls) {
  const urls = RPC[chain];
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = urls[attempt % urls.length];
    try {
      const res = await fetch(url, {
        method: 'POST', // JSON-RPC transport; eth_call is read-only
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(calls),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body)) throw new Error(`non-batch response: ${JSON.stringify(body).slice(0, 200)}`);
      // bsc-dataseed answers an over-sized batch with a single rate-limit error
      // instead of per-call results; treat missing/rate-limited items as a retryable failure.
      const rateLimited = body.find((r) => r.error && /rate limit/i.test(r.error.message || ''));
      if (rateLimited) throw new Error(rateLimited.error.message);
      const byId = new Map(body.map((r) => [r.id, r]));
      const results = calls.map((c) => byId.get(c.id));
      if (results.some((r) => !r)) throw new Error(`only ${body.length}/${calls.length} results returned`);
      return { results, url };
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`RPC ${chain} failed: ${lastErr && lastErr.message}`);
}

async function validateChain(chain, entries, label, callsPerBatch = CALLS_PER_BATCH) {
  let nextId = 1;
  const perBatch = Math.max(1, Math.floor(callsPerBatch / 2));
  const outcome = new Map(); // entry.id -> { symbol, decimals, error }
  for (let i = 0; i < entries.length; i += perBatch) {
    const slice = entries.slice(i, i + perBatch);
    const calls = [];
    for (const e of slice) {
      for (const data of [SEL_SYMBOL, SEL_DECIMALS]) {
        calls.push({
          jsonrpc: '2.0',
          id: nextId++,
          method: 'eth_call',
          params: [{ to: e.address, data }, 'latest'],
        });
      }
    }
    let results;
    try {
      ({ results } = await rpcBatch(chain, calls));
    } catch (err) {
      slice.forEach((e) => outcome.set(e.id, { error: err.message }));
      continue;
    }
    slice.forEach((e, k) => {
      const rs = results[k * 2];
      const rd = results[k * 2 + 1];
      const err = (r) => (!r ? 'no response' : r.error ? r.error.message || JSON.stringify(r.error) : null);
      const error = err(rs) || err(rd);
      outcome.set(e.id, error ? { error } : { symbol: decodeString(rs.result), decimals: decodeUint(rd.result) });
    });
    process.stdout.write(`\r  ${label}: ${Math.min(i + perBatch, entries.length)}/${entries.length}`);
    await sleep(BATCH_DELAY_MS);
  }
  process.stdout.write('\n');
  return outcome;
}

async function validateEvm(entries) {
  const kept = [];
  for (const chain of ['ETH', 'BSC']) {
    const list = entries.filter((e) => e.chain === chain);
    let outcome = await validateChain(chain, list, `${chain} eth_call`);
    // Retry transport/RPC errors once in small batches (a revert will fail again, which is fine).
    const retry = list.filter((e) => outcome.get(e.id).error);
    if (retry.length) {
      await sleep(2000);
      const again = await validateChain(chain, retry, `${chain} retry`, 10);
      again.forEach((v, k) => outcome.set(k, v));
    }
    for (const e of list) {
      const o = outcome.get(e.id);
      if (o.error) dropped.push({ id: e.id, reason: `eth_call failed: ${o.error.slice(0, 120)}` });
      else if (o.symbol !== e.symbol)
        dropped.push({ id: e.id, reason: `symbol mismatch: on-chain "${o.symbol}" vs source "${e.symbol}"` });
      else if (o.decimals !== e.decimals)
        dropped.push({ id: e.id, reason: `decimals mismatch: on-chain ${o.decimals} vs expected ${e.decimals}` });
      else kept.push(e);
    }
  }
  return kept;
}

// ---------------------------------------------------------------- main

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function countBy(list, f) {
  const o = {};
  list.forEach((x) => {
    const k = f(x);
    o[k] = (o[k] || 0) + 1;
  });
  return o;
}

async function main() {
  const ondo = await loadOndo();
  const xstocks = await loadXStocks(ondo.etfTickers);
  const evm = [...ondo.entries, ...xstocks, ...goldEntries()];

  // De-duplicate ids (keep first).
  const seen = new Set();
  const unique = [];
  for (const e of evm) {
    if (seen.has(e.id)) dropped.push({ id: e.id, reason: 'duplicate id in sources' });
    else {
      seen.add(e.id);
      unique.push(e);
    }
  }

  console.log(`Validating ${unique.length} EVM entries on-chain...`);
  const validEvm = await validateEvm(unique);
  const stellar = await stellarEntries();
  await checkLogos([...validEvm, ...stellar]);

  const all = [...validEvm, ...stellar].sort(
    (a, b) =>
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      cmp(a.symbol.toUpperCase(), b.symbol.toUpperCase()) ||
      cmp(a.symbol, b.symbol) ||
      CHAIN_ORDER[a.chain] - CHAIN_ORDER[b.chain],
  );

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const json = JSON.stringify(compact(all));
  fs.writeFileSync(OUT_FILE, json);

  console.log('\n=== Summary ===');
  console.log(`kept: ${all.length}`);
  console.log('by issuer/chain:', JSON.stringify(countBy(all, (e) => `${e.issuer}/${e.chain}`)));
  console.log('by category:', JSON.stringify(countBy(all, (e) => e.category)));
  console.log('by issuer/category:', JSON.stringify(countBy(all, (e) => `${e.issuer}/${e.category}`)));
  console.log(`dropped: ${dropped.length}`);
  dropped
    .sort((a, b) => cmp(a.id, b.id))
    .forEach((d) => console.log(`  - ${d.id}: ${d.reason}`));
  console.log(`wrote ${path.relative(process.cwd(), OUT_FILE)} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`);
}

// ---- Logos: every logo URL must load (HTTP 200, image). Ondo CSV sometimes points at another
// token's file (AALon -> abton_…): then try Ondo's CDN name for the symbol. Broken -> null (letter avatar).
async function urlOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'curl/8.5.0' } });
    return r.ok && /^image\//.test(r.headers.get('content-type') || 'image/');
  } catch (e) {
    return false;
  }
}

async function checkLogos(entries) {
  const urls = new Map(); // url -> ok
  const fixes = { ondoRenamed: [], broken: [] };
  const want = (e) => {
    if (!e.logo) return [];
    const list = [];
    const mismatch = e.issuer === 'ondo' && !e.logo.toLowerCase().includes(e.symbol.toLowerCase());
    if (!mismatch) list.push(e.logo);
    if (e.issuer === 'ondo') list.push(`https://cdn.ondo.finance/tokens/logos/${e.symbol.toLowerCase()}_160x160.png`);
    return list;
  };
  const all = Array.from(new Set(entries.flatMap(want)));
  console.log(`Checking ${all.length} logo URLs...`);
  for (let i = 0; i < all.length; i += 16) {
    const part = all.slice(i, i + 16);
    const res = await Promise.all(part.map(urlOk));
    part.forEach((u, k) => urls.set(u, res[k]));
  }
  for (const e of entries) {
    if (!e.logo) continue;
    const ok = want(e).find((u) => urls.get(u));
    if (!ok) {
      fixes.broken.push(e.id);
      e.logo = null;
    } else if (ok !== e.logo) {
      fixes.ondoRenamed.push(e.id);
      e.logo = ok;
    }
  }
  console.log(`  logos fixed from symbol name: ${fixes.ondoRenamed.join(' ') || 'none'}`);
  console.log(`  logos broken -> letter avatar (${fixes.broken.length}): ${fixes.broken.slice(0, 40).join(' ')}`);
}

// ---- Compact output (the app bundles this file; src/rwa/data/assets.js expands it) ----
// Per-issuer fields (termsUrl, regions, marketHours, multiplier kind, oracle per chain) are stored
// once; rows are arrays; the same token on several chains is one row; logo URLs use a prefix table.
// Row: [symbol, name, underlying, issuer, category, "ETH|BSC", "addrETH|addrBSC" (or one shared
// address, or "CODE:ISSUER" for Stellar), decimals, "prefixIndex:file" | null, market | null]
function compact(all) {
  const issuers = {};
  for (const e of all) {
    const d = {
      termsUrl: e.termsUrl,
      regions: e.regions,
      marketHours: e.marketHours,
      multiplier: e.multiplier ? e.multiplier.kind : 'none',
    };
    const cur = issuers[e.issuer];
    if (!cur) issuers[e.issuer] = { ...d, oracle: {} };
    else if (JSON.stringify({ ...cur, oracle: undefined }) !== JSON.stringify({ ...d, oracle: undefined })) {
      throw new Error(`issuer ${e.issuer} has mixed per-issuer fields (${e.id})`);
    }
    if (e.multiplier && e.multiplier.oracle) issuers[e.issuer].oracle[e.chain] = e.multiplier.oracle;
  }
  const prefixes = [];
  const logo = (e) => {
    if (!e.logo) return null;
    // Source data error guard: an Ondo logo file must name the token (e.g. AALon had abton_…).
    if (e.issuer === 'ondo' && !e.logo.toLowerCase().includes(e.symbol.toLowerCase())) return null;
    const i = e.logo.lastIndexOf('/') + 1;
    const pre = e.logo.slice(0, i);
    let k = prefixes.indexOf(pre);
    if (k === -1) k = prefixes.push(pre) - 1;
    return `${k}:${e.logo.slice(i)}`;
  };
  const groups = new Map(); // issuer|symbol -> entries in chain order
  for (const e of all) {
    const k = `${e.issuer}|${e.symbol}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const rows = [];
  for (const g of groups.values()) {
    const e = g[0];
    if (g.some((x) => x.name !== e.name || x.decimals !== e.decimals || x.category !== e.category || x.market !== e.market)) {
      g.forEach((x) => rows.push(rowOf([x])));
    } else rows.push(rowOf(g));
  }
  function rowOf(g) {
    const e = g[0];
    const addrs = g.map((x) => (x.chain === 'XLM' ? `${x.code}:${x.stellarIssuer}` : x.address));
    const addr = addrs.every((a) => a === addrs[0]) ? addrs[0] : addrs.join('|');
    return [e.symbol, e.name, e.underlying || null, e.issuer, e.category, g.map((x) => x.chain).join('|'), addr, e.decimals, logo(e), e.market || null];
  }
  return { v: 2, issuers, logoPrefixes: prefixes, rows };
}

// `--recompact`: rewrite an existing pretty (array) rwaAssets.json in the compact format without
// re-fetching or re-validating (used once when the compact format was introduced).
module.exports = { compact };

if (require.main !== module) {
  // imported (unit test of `compact`): do nothing
} else if (process.argv.includes('--recompact')) {
  const prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  if (!Array.isArray(prev)) {
    console.log('already compact');
    process.exit(0);
  }
  const json = JSON.stringify(compact(prev));
  fs.writeFileSync(OUT_FILE, json);
  console.log(`recompacted ${prev.length} entries -> ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB`);
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
