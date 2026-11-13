import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useSelector } from "react-redux";
import { enableTrading } from "../api/asterAgent";
import { fetchLeverageBrackets, fetchPerpsBalance, clearSignedCaches } from "../api/asterSigned";
import { getAgent, removeAgent, isAgentStoreAvailable } from "../storage/agentKeyStore";

const EXPIRY_MARGIN_MS = 60 * 60 * 1000; // treat keys expiring within 1h as expired
const NO_DEPOSIT_CODE = -5050; // Aster: account endpoints only work after a first deposit

// Active wallet's main EVM address (checksummed) or null for Stellar-only wallets.
export const useMainEvmAddress = () => {
  const address = useSelector((state) => state?.wallet?.address);
  return typeof address === "string" && ethers.utils.isAddress(address)
    ? ethers.utils.getAddress(address)
    : null;
};

// status: checking | no-evm | locked (native secure storage missing, e.g. old build + OTA JS) | not-enabled | enabling | enabled
export const usePerpsAgent = (active) => {
  const user = useMainEvmAddress();
  const [status, setStatus] = useState("checking");
  const [agent, setAgent] = useState(null);
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState(null); // { balance, available } in USDT
  const [balanceError, setBalanceError] = useState(null);
  const [leverage, setLeverage] = useState({}); // symbol -> max leverage
  const userRef = useRef(user);
  userRef.current = user;

  const dropAgent = useCallback(async (forUser, message) => {
    try {
      await removeAgent(forUser);
    } catch (e) {
      // ignore
    }
    if (userRef.current !== forUser) return;
    clearSignedCaches();
    setAgent(null);
    setBalance(null);
    setLeverage({});
    setStatus("not-enabled");
    setError(message || null);
  }, []);

  // Load the agent for the active wallet (re-runs when the wallet changes).
  useEffect(() => {
    let cancelled = false;
    setAgent(null);
    setBalance(null);
    setLeverage({});
    setError(null);
    if (!user) {
      setStatus("no-evm");
      return undefined;
    }
    if (!isAgentStoreAvailable()) {
      setStatus("locked");
      return undefined;
    }
    setStatus("checking");
    (async () => {
      let stored = null;
      try {
        stored = await getAgent(user);
      } catch (e) {
        stored = null;
      }
      if (cancelled) return;
      if (stored && Number(stored.expiresAt) > Date.now() + EXPIRY_MARGIN_MS) {
        setAgent(stored);
        setStatus("enabled");
      } else {
        if (stored) await dropAgent(user, "Your trading key expired. Enable trading again.");
        if (!cancelled) setStatus("not-enabled");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, dropAgent]);

  const refreshAccount = useCallback(async () => {
    if (!agent || !user) return;
    const forUser = user;
    const [bal, lev] = await Promise.all([
      fetchPerpsBalance(agent, forUser),
      Object.keys(leverage).length ? Promise.resolve(null) : fetchLeverageBrackets(agent, forUser),
    ]);
    if (userRef.current !== forUser) return;
    if (bal.agentInvalid || (lev && lev.agentInvalid)) {
      await dropAgent(forUser, "Your trading key is no longer valid. Enable trading again.");
      return;
    }
    if (bal.code === NO_DEPOSIT_CODE) {
      // Aster: "This function can only be used after deposit" -> nothing deposited yet.
      setBalance({ balance: 0, available: 0, noDeposit: true });
      setBalanceError(null);
    } else if (bal.error) {
      setBalanceError(bal.error);
    } else {
      const usdt = (Array.isArray(bal.data) ? bal.data : []).find((b) => b.asset === "USDT");
      setBalance({
        balance: Number(usdt ? usdt.balance : 0),
        available: Number(usdt ? usdt.availableBalance : 0),
      });
      setBalanceError(null);
    }
    if (lev && !lev.error) setLeverage(lev.data || {}); // needs a deposit first (-5050)
  }, [agent, user, leverage, dropAgent]);

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
      setAgent(record);
      setStatus("enabled");
    } catch (e) {
      if (userRef.current !== forUser) return;
      setStatus("not-enabled");
      setError(e && e.message ? e.message : "Could not enable trading");
    }
  }, [user, status]);

  const reset = useCallback(() => dropAgent(user, null), [user, dropAgent]);

  return {
    user,
    status,
    agent,
    error,
    balance,
    balanceError,
    leverage,
    enable,
    reset,
    refreshAccount,
  };
};
