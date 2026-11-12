import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAccount, fetchOpenOrders, fetchPositions } from "../api/asterTrade";
import { asterWs } from "../api/asterWs";
import { isValid, toUnits } from "../utils/decimal";

const POLL_MS = 5000;
const NO_DEPOSIT_CODE = -5050;

// Positions / open orders / account totals for the enabled agent, polled every 5s while `active`.
// Live mark prices come from the shared market socket.
export const usePerpsAccount = ({ agent, user, active, onAgentInvalid }) => {
  const [account, setAccount] = useState(null); // { equity, available, walletBalance, unrealizedPnl }
  const [positions, setPositions] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [noDeposit, setNoDeposit] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [marks, setMarks] = useState({}); // symbol -> mark price (number)
  const busyRef = useRef(false);
  const invalidRef = useRef(onAgentInvalid);
  invalidRef.current = onAgentInvalid;

  const refresh = useCallback(async () => {
    if (!agent || !user || busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const [acc, pos, ord] = await Promise.all([
        fetchAccount(agent, user),
        fetchPositions(agent, user),
        fetchOpenOrders(agent, user),
      ]);
      if (acc.agentInvalid || pos.agentInvalid || ord.agentInvalid) {
        if (invalidRef.current) invalidRef.current();
        return;
      }
      if ([acc, pos, ord].some((r) => r.code === NO_DEPOSIT_CODE)) {
        setNoDeposit(true);
        setAccount({ equity: "0", available: "0", walletBalance: "0", unrealizedPnl: "0" });
        setPositions([]);
        setOpenOrders([]);
        setError(null);
        return;
      }
      setNoDeposit(false);
      const firstError = [acc, pos, ord].find((r) => r.error);
      setError(firstError ? firstError.error : null);
      if (!acc.error && acc.data) {
        const d = acc.data;
        setAccount({
          equity: String(d.totalMarginBalance ?? "0"),
          available: String(d.availableBalance ?? "0"),
          walletBalance: String(d.totalWalletBalance ?? "0"),
          unrealizedPnl: String(d.totalUnrealizedProfit ?? "0"),
        });
      }
      if (!pos.error && Array.isArray(pos.data)) {
        setPositions(
          pos.data.filter((p) => isValid(p.positionAmt) && !toUnits(p.positionAmt).isZero())
        );
      }
      if (!ord.error && Array.isArray(ord.data)) setOpenOrders(ord.data);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [agent, user]);

  // Poll while focused.
  useEffect(() => {
    if (!active || !agent) return undefined;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [active, agent, refresh]);

  // Live mark prices for open positions.
  const positionSymbols = positions.map((p) => p.symbol).sort().join(",");
  useEffect(() => {
    if (!active || !positionSymbols) return undefined;
    const wanted = new Set(positionSymbols.split(","));
    const pending = {};
    const off = asterWs.subscribe("!markPrice@arr@1s", (data) => {
      if (!Array.isArray(data)) return;
      data.forEach((m) => {
        if (wanted.has(m.s)) pending[m.s] = Number(m.p);
      });
    });
    const flush = setInterval(() => {
      if (Object.keys(pending).length === 0) return;
      const copy = { ...pending };
      Object.keys(pending).forEach((k) => delete pending[k]);
      setMarks((prev) => ({ ...prev, ...copy }));
    }, 1000);
    return () => {
      off();
      clearInterval(flush);
    };
  }, [active, positionSymbols]);

  // Reset when the agent/user changes.
  useEffect(() => {
    setAccount(null);
    setPositions([]);
    setOpenOrders([]);
    setNoDeposit(false);
    setError(null);
  }, [agent, user]);

  return { account, positions, openOrders, noDeposit, error, loading, marks, refresh };
};
