// Aster v3 requests signed by the AGENT key (in JS, no user prompt).
// Never log keys, signatures or full signed URLs.
import { ethers } from "ethers";
import { asterFetch, fetchServerTime } from "./asterPublic";
import { logPerpsError } from "../utils/perpsLog";

const AGENT_DOMAIN = {
  name: "AsterSignTransaction",
  version: "1",
  chainId: 1666, // Aster mainnet signing chain for agent requests
  verifyingContract: "0x0000000000000000000000000000000000000000",
};
const MESSAGE_TYPES = { Message: [{ name: "msg", type: "string" }] };

const TIME_RESYNC_MS = 60000;
let serverTimeOffset = 0; // serverTime - localTime (ms)
let lastTimeSync = 0;
let lastNonce = 0;
let timeSyncInFlight = null;
let lastTimeSyncAttempt = 0;

const runTimeSync = () => {
  if (!timeSyncInFlight) {
    timeSyncInFlight = (async () => {
      const t0 = Date.now();
      const { data } = await fetchServerTime();
      const t1 = Date.now();
      if (data) {
        serverTimeOffset = data - Math.round((t0 + t1) / 2);
        lastTimeSync = Date.now();
      }
    })().finally(() => {
      timeSyncInFlight = null;
    });
  }
  return timeSyncInFlight;
};

// Keep the local clock aligned with Aster's: ONE global offset for the app session.
// The first signed request waits for the first sync; afterwards the offset is refreshed in the
// background when older than 60s (requests don't wait for it). `force` waits for a fresh sync.
export const syncServerTime = async (force = false) => {
  if (force) return runTimeSync();
  if (!lastTimeSync) {
    if (timeSyncInFlight) return timeSyncInFlight; // first sync running: wait for it
    // Never synced: wait once. If that failed recently, use the local clock and retry in background.
    if (Date.now() - lastTimeSyncAttempt < TIME_RESYNC_MS) {
      runTimeSync();
      return undefined;
    }
    lastTimeSyncAttempt = Date.now();
    return runTimeSync();
  }
  if (Date.now() - lastTimeSync >= TIME_RESYNC_MS) runTimeSync();
  return undefined;
};

// Signing wallet for the agent key, created once (deriving the public key is slow in JS).
let cachedSigner = null;
const signerFor = (pk) => {
  if (!cachedSigner || cachedSigner.pk !== pk) cachedSigner = { pk, wallet: new ethers.Wallet(pk) };
  return cachedSigner.wallet;
};

// Identical GET requests that are already in flight share one request (no second signature).
const inflightGets = new Map();

export const getServerNowMs = () => Date.now() + serverTimeOffset;

// Microsecond nonce from Aster time; strictly increasing within this app session.
export const nextNonceMicros = () => {
  let nonce = Math.trunc(getServerNowMs()) * 1000;
  if (nonce <= lastNonce) nonce = lastNonce + 1;
  lastNonce = nonce;
  return nonce;
};

const toParamString = (value) => String(value);

// Signs and sends one agent request. Resolves to { data, error, code, agentInvalid }.
// GETs with the same user/agent/path/params that are already running are shared.
export const asterSignedRequest = (req) => {
  const { agent, user, method = "GET", path, params = {} } = req;
  if (method !== "GET" || !agent || !agent.address) return signedRequestOnce(req);
  const dedupeKey = `${user}|${agent.address}|${path}|${JSON.stringify(
    Object.keys(params)
      .sort()
      .map((k) => [k, params[k]])
  )}`;
  const existing = inflightGets.get(dedupeKey);
  if (existing) return existing;
  const p = signedRequestOnce(req).finally(() => inflightGets.delete(dedupeKey));
  inflightGets.set(dedupeKey, p);
  return p;
};

const signedRequestOnce = async ({ agent, user, method = "GET", path, params = {} }) => {
  if (!agent || !agent.pk || !agent.address) {
    return { data: null, error: "Trading is not enabled", code: null, agentInvalid: true };
  }
  await syncServerTime();
  const ordered = { user, signer: agent.address };
  Object.keys(params).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null) ordered[k] = toParamString(params[k]);
  });
  ordered.nonce = String(nextNonceMicros());
  const qs = new URLSearchParams(ordered).toString();

  let signature;
  try {
    signature = await signerFor(agent.pk)._signTypedData(AGENT_DOMAIN, MESSAGE_TYPES, { msg: qs });
  } catch (e) {
    logPerpsError({ step: "sign", path: `${method} ${path}`, msg: e && e.message ? e.message : "sign failed" });
    return { data: null, error: "Could not sign request", code: null, agentInvalid: false };
  }

  const signed = `${qs}&signature=${signature}`;
  const result =
    method === "GET"
      ? await asterFetch(`${path}?${signed}`, { method: "GET" })
      : await asterFetch(path, {
          method,
          body: signed,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
  return { ...result, agentInvalid: isAgentInvalidError(result) };
};

// Aster does not document a dedicated "agent invalid/expired" code. Treat permission /
// unauthorized errors and messages about the agent/signer as "agent no longer valid".
const AGENT_INVALID_CODES = [-1002, -2014, -2015];
export const isAgentInvalidError = ({ error, code }) => {
  if (!error || code === null || code === undefined) return false; // network errors etc.
  if (/nonce/i.test(String(error))) return false; // e.g. -4225 "Nonce Expired": timing, not the agent
  if (AGENT_INVALID_CODES.includes(code)) return true;
  return /agent|signer|not (exist|found)|expired|unauthori/i.test(String(error));
};

// --- read endpoints -------------------------------------------------------------

export const fetchPerpsBalance = (agent, user) =>
  asterSignedRequest({ agent, user, path: "/fapi/v3/balance" });

export const fetchPerpsAccount = (agent, user) =>
  asterSignedRequest({ agent, user, path: "/fapi/v3/account" });

export const fetchPositionRisk = (agent, user) =>
  asterSignedRequest({ agent, user, path: "/fapi/v3/positionRisk" });

// Max leverage per symbol (highest initialLeverage across its brackets), cached in memory.
let maxLeverageCache = {};
export const getCachedMaxLeverage = (symbol) => maxLeverageCache[symbol] || null;
export const getMaxLeverageMap = () => maxLeverageCache;

export const fetchLeverageBrackets = async (agent, user) => {
  // Docs recommend the plural path; the singular one is deprecated but still works.
  let res = await asterSignedRequest({ agent, user, path: "/fapi/v3/leverageBrackets" });
  if (res.error && !res.agentInvalid) {
    res = await asterSignedRequest({ agent, user, path: "/fapi/v3/leverageBracket" });
  }
  if (res.error) return res;
  const list = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
  const map = {};
  list.forEach((item) => {
    const levs = (item.brackets || []).map((b) => Number(b.initialLeverage)).filter(Number.isFinite);
    if (item.symbol && levs.length) map[item.symbol] = Math.max(...levs);
  });
  maxLeverageCache = map;
  return { ...res, data: map };
};

export const clearSignedCaches = () => {
  maxLeverageCache = {};
};
