import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { loadOrders, upsertOrder, subscribeOrders } from "./orderStore";
import { applyUpdate, isFinal, readStatusResponse } from "./orderState";
import { fetchOrderStatus } from "./executeOrder";
import { tokenBalance } from "../api/balances";

const POLL_MS = 6000;
const NOT_SENT_AFTER_MS = 2 * 60 * 1000;

// Tracks this wallet's open RWA orders while `active` (screen focused) and the app is in front.
// No background polling. Returns { orders } (newest first) — re-renders on every change.
export const useOrderTracker = (wallet, active) => {
  const [orders, setOrders] = useState([]);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const busy = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!wallet) return undefined;
    let alive = true;
    loadOrders(wallet).then((l) => alive && setOrders(l));
    const unsub = subscribeOrders((w, list) => {
      if (alive && w === wallet) setOrders(list);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [wallet]);

  useEffect(() => {
    if (!wallet || !active || !appActive) return undefined;
    let stopped = false;
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const list = await loadOrders(wallet);
        const open = list.filter((r) => !isFinal(r.stage));
        for (const r of open) {
          if (stopped) break;
          const now = Date.now();
          if (!r.orderHash) {
            // App closed / crashed before the order was sent: it can never fill.
            if (now - r.createdAt > NOT_SENT_AFTER_MS) {
              // eslint-disable-next-line no-await-in-loop
              await upsertOrder(wallet, { ...r, stage: "failed", error: "The order was not sent. Nothing was traded.", doneAt: now });
            }
            continue;
          }
          let status = null;
          let fillTx = null;
          // eslint-disable-next-line no-await-in-loop
          const st = await fetchOrderStatus(r).catch(() => ({ error: true }));
          if (st && st.res) ({ status, fillTx } = readStatusResponse(st.res));
          let outBalance = null;
          try {
            // eslint-disable-next-line no-await-in-loop
            outBalance = await tokenBalance(r.chain, wallet, r.outToken.address);
          } catch (e) {
            outBalance = null;
          }
          const next = applyUpdate(r, { status, fillTx, outBalance, now });
          if (next.stage !== r.stage || next.fillTx !== r.fillTx || (status && status !== r.lastStatus)) {
            // eslint-disable-next-line no-await-in-loop
            await upsertOrder(wallet, { ...next, lastStatus: status || r.lastStatus || null });
          }
        }
      } finally {
        busy.current = false;
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [wallet, active, appActive]);

  return { orders };
};
