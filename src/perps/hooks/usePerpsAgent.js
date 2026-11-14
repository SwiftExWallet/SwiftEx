import { logPerpsError } from "../utils/perpsLog";
import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useSelector } from "react-redux";
import { enableTrading } from "../api/asterAgent";
import { fetchLeverageBrackets, getMaxLeverageMap, clearSignedCaches } from "../api/asterSigned";
import { getAgent, removeAgent, isAgentStoreAvailable } from "../storage/agentKeyStore";

const EXPIRY_MARGIN_MS = 60 * 60 * 1000; // treat keys expiring within 1h as expired

// Active wallet's main EVM address (checksummed) or null for Stellar-only wallets.
export const useMainEvmAddress = () => {
  const address = useSelector((state) => state?.wallet?.address);
  return typeof address === "string" && ethers.utils.isAddress(address)
    ? ethers.utils.getAddress(address)
    : null;
};

// ONE in-memory agent state for the app session, shared by every screen (Perps tab, market
// screen), so a screen opened later has the trading key immediately and a reset/enable in one
// place updates all of them. Loaded from secure storage once per wallet.
let shared = { user: null, status: null, agent: null }; // status: enabled | not-enabled
const agentListeners = new Set();
const setShared = (next) => {
  shared = next;
  agentListeners.forEach((fn) => fn(shared));
};
let loadingFor = null; // { user, promise }

const isUsable = (stored) => stored && Number(stored.expiresAt) > Date.now() + EXPIRY_MARGIN_MS;

const loadAgentOnce = (user) => {
  if (loadingFor && loadingFor.user === user) return loadingFor.promise;
  const promise = (async () => {
    let stored = null;
    try {
      stored = await getAgent(user);
    } catch (e) {
      stored = null;
    }
    return stored;
  })().finally(() => {
    if (loadingFor && loadingFor.user === user) loadingFor = null;
  });
  loadingFor = { user, promise };
  return promise;
};

// status: checking | no-evm | locked (native secure storage missing, e.g. old build + OTA JS) | not-enabled | enabling | enabled
export const usePerpsAgent = (active) => {
  const user = useMainEvmAddress();
  const initial = shared.user === user && user ? shared : null;
  const [status, setStatus] = useState(initial ? initial.status : "checking");
  const [agent, setAgent] = useState(initial ? initial.agent : null);
  const [error, setError] = useState(null);
  const [leverage, setLeverage] = useState(() => getMaxLeverageMap()); // symbol -> max leverage
  const userRef = useRef(user);
  userRef.current = user;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Follow the shared state (another screen enabled / reset trading).
  useEffect(() => {
    const onShared = (s) => {
      if (s.user !== userRef.current) return;
      setAgent(s.agent);
      setStatus((prev) => (prev === "enabling" && s.status !== "enabled" ? prev : s.status));
      if (!s.agent) setLeverage({});
    };
    agentListeners.add(onShared);
    return () => {
      agentListeners.delete(onShared);
    };
  }, []);

  const dropAgent = useCallback(async (forUser, message) => {
    try {
      await removeAgent(forUser);
    } catch (e) {
      // ignore
    }
    if (userRef.current !== forUser) return;
    clearSignedCaches();
    setShared({ user: forUser, status: "not-enabled", agent: null });
    setError(message || null);
  }, []);

  // Load the agent for the active wallet (re-runs when the wallet changes). Uses the shared
  // in-memory copy when this wallet's key was already loaded in this app session.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!user) {
      setAgent(null);
      setStatus("no-evm");
      return undefined;
    }
    if (!isAgentStoreAvailable()) {
      setAgent(null);
      setStatus("locked");
      return undefined;
    }
    if (shared.user === user && shared.status) {
      if (shared.agent && !isUsable(shared.agent)) {
        dropAgent(user, "Your trading key expired. Enable trading again.");
      } else {
        setAgent(shared.agent);
        setStatus(shared.status);
      }
      return undefined;
    }
    setAgent(null);
    setStatus("checking");
    (async () => {
      const stored = await loadAgentOnce(user);
      if (cancelled) return;
      if (isUsable(stored)) {
        setShared({ user, status: "enabled", agent: stored });
      } else if (stored) {
        await dropAgent(user, "Your trading key expired. Enable trading again.");
      } else {
        setShared({ user, status: "not-enabled", agent: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, dropAgent]);

  // Max leverage per market: fetched once per app session (signed), shared via asterSigned.
  // Account balances / positions come from the shared account store (usePerpsAccount).
  const refreshAccount = useCallback(async () => {
    if (!agent || !user) return;
    if (Object.keys(getMaxLeverageMap()).length) {
      setLeverage(getMaxLeverageMap());
      return;
    }
    const forUser = user;
    const lev = await fetchLeverageBrackets(agent, forUser);
    if (!mountedRef.current || userRef.current !== forUser) return;
    if (lev.agentInvalid) {
      await dropAgent(forUser, "Your trading key is no longer valid. Enable trading again.");
      return;
    }
    if (!lev.error) setLeverage(lev.data || {}); // needs a deposit first (-5050)
  }, [agent, user, dropAgent]);

  useEffect(() => {
    if (active && status === "enabled") refreshAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, status, agent]);

  const enable = useCallback(async () => {
    if (!user || status === "enabling") return;
    const forUser = user;
    setError(null);
    setStatus("enabling");
    try {
      const record = await enableTrading(forUser);
      if (userRef.current !== forUser) return;
      setShared({ user: forUser, status: "enabled", agent: record });
    } catch (e) {
      if (userRef.current !== forUser) return;
      setStatus("not-enabled");
      setError(e && e.message ? e.message : "Could not enable trading");
      logPerpsError({ step: "enable-trading", msg: e && e.message });
    }
  }, [user, status]);

  const reset = useCallback(() => dropAgent(user, null), [user, dropAgent]);

  return {
    user,
    status,
    agent,
    error,
    balance: null, // balances now come from usePerpsAccount (one shared poller)
    balanceError: null,
    leverage,
    enable,
    reset,
    refreshAccount,
  };
};
