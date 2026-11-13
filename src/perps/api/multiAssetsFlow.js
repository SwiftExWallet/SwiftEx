// Guided "Turn on Multi-Assets" flow (all dialogs via the iOS-safe showInfo).
// Endpoints (agent-signed):
//   GET  /fapi/v3/positionRisk        every symbol + marginType (also zero positions)
//   GET  /fapi/v3/openOrders          all symbols
//   POST /fapi/v3/marginType          CROSSED, per leftover Isolated symbol (no position/orders)
//   DELETE /fapi/v3/order             only orders the user agreed to cancel
//   POST /fapi/v3/multiAssetsMargin   true
// Never closes a position. Every change is confirmed first; results (incl. partial failures)
// are reported, and the account is re-read before each attempt, so it is safe to retry.
import { fetchPositions, fetchOpenOrders, setMarginType, setMultiAssetsMode, cancelOrder, fetchMultiAssetsMode } from "./asterTrade";
import { planMultiAssets, describePlan, summarizeResults, baseOfSymbol } from "../utils/marginModeLogic";
import { showInfo } from "../utils/modalSafe";
import { friendlyAsterError } from "../utils/asterErrors";
import { logPerpsError } from "../utils/perpsLog";

let running = false; // reading the account (short)
let executing = false; // applying confirmed changes

const readPlan = async (agent, user) => {
  const [pos, ord] = await Promise.all([fetchPositions(agent, user), fetchOpenOrders(agent, user)]);
  if (pos.error || ord.error) return { error: pos.error ? pos : ord };
  return { plan: planMultiAssets({ positions: Array.isArray(pos.data) ? pos.data : [], openOrders: Array.isArray(ord.data) ? ord.data : [] }) };
};

const names = (symbols) => symbols.map(baseOfSymbol).join(", ");

// Runs the confirmed steps. Returns { ok, text }.
const execute = async (agent, user, plan) => {
  const lines = [];
  // 1. cancel the open orders the user agreed to (only on leftover Isolated symbols)
  if (plan.blockingOrders.length) {
    const res = [];
    for (const o of plan.blockingOrders) {
      // eslint-disable-next-line no-await-in-loop
      const r = await cancelOrder(agent, user, { symbol: o.symbol, orderId: o.orderId });
      res.push({ symbol: o.symbol, ok: !r.error, error: r.error ? friendlyAsterError(r) : null });
    }
    const s = summarizeResults(res);
    if (!s.allOk) {
      return { ok: false, text: `Couldn't cancel ${s.bad.length} order(s): ${s.bad.map((b) => `${baseOfSymbol(b.symbol)} (${b.error})`).join(", ")}. Nothing else was changed.` };
    }
    lines.push(`Cancelled ${res.length} order(s).`);
  }
  // 2. leftover Isolated symbols -> Cross
  const toCross = [...plan.switchable, ...plan.withOrders];
  if (toCross.length) {
    const res = [];
    for (const symbol of toCross) {
      // eslint-disable-next-line no-await-in-loop
      const r = await setMarginType(agent, user, symbol, "CROSSED");
      res.push({ symbol, ok: !r.error, error: r.error ? friendlyAsterError(r) : null });
    }
    const s = summarizeResults(res);
    if (s.ok.length) lines.push(`${names(s.ok)} switched to Cross.`);
    if (!s.allOk) {
      return {
        ok: false,
        text: `${lines.join(" ")} Couldn't switch ${s.bad.map((b) => `${baseOfSymbol(b.symbol)} (${b.error})`).join(", ")}. Multi-Assets is still off — you can try again.`.trim(),
      };
    }
  }
  // 3. Multi-Assets on
  const m = await setMultiAssetsMode(agent, user, true);
  if (m.error) {
    logPerpsError({ step: "multiAssets:on", code: m.code, msg: m.error });
    return { ok: false, retryPlan: m.code === -4167 || m.code === -4171, text: `${lines.join(" ")} ${friendlyAsterError(m)}`.trim() };
  }
  lines.push("Multi-Assets mode is on.");
  return { ok: true, text: lines.join(" ") };
};

// Entry point. onDone(enabled: boolean) is called when the flow ends.
export const startMultiAssetsFlow = async ({ agent, user, onDone, attempt = 0 }) => {
  if (!agent || !user || (running && attempt === 0)) return;
  running = true;
  const finish = (enabled) => {
    running = false;
    if (onDone) onDone(enabled);
  };
  try {
    const mode = await fetchMultiAssetsMode(agent, user);
    if (!mode.error && mode.data && (mode.data.multiAssetsMargin === true || mode.data.multiAssetsMargin === "true")) {
      showInfo("success", "Multi-Assets is already on", "All your Perps assets count as Cross margin.");
      finish(true);
      return;
    }
    const r = await readPlan(agent, user);
    if (r.error) {
      showInfo("error", "Couldn't check your account", friendlyAsterError(r.error) || "Check your connection and try again.");
      finish(false);
      return;
    }
    const d = describePlan(r.plan);
    if (d.kind === "blocked") {
      showInfo("info", d.title, d.msg);
      finish(false);
      return;
    }
    running = false; // the dialog may be dismissed without a button: never keep the lock
    const action = d.kind === "orders" ? "Cancel & turn on" : d.kind === "switch" ? "Switch & turn on" : "Turn on";
    showInfo("info", d.title, d.msg, [
      { text: "Not now", style: "cancel", onPress: () => onDone && onDone(false) },
      {
        text: action,
        onPress: async () => {
          if (executing) return; // double tap
          executing = true;
          try {
            const res = await execute(agent, user, r.plan);
            executing = false;
            if (res.ok) {
              showInfo("success", "Multi-Assets on", res.text);
              finish(true);
            } else if (res.retryPlan && attempt < 1) {
              // Aster still sees a blocker we didn't know about: re-read and guide again.
              startMultiAssetsFlow({ agent, user, onDone, attempt: attempt + 1 });
            } else {
              showInfo("error", "Not finished", res.text);
              finish(false);
            }
          } catch (e) {
            executing = false;
            logPerpsError({ step: "multiAssets:exception", msg: e && e.message });
            showInfo("error", "Something went wrong", "Please check and try again.");
            finish(false);
          }
        },
      },
    ]);
  } catch (e) {
    logPerpsError({ step: "multiAssets:exception", msg: e && e.message });
    showInfo("error", "Something went wrong", "Please try again.");
    finish(false);
  }
};
