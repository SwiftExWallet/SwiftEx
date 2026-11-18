// RWA order state machine (pure, unit tested). No secrets are ever stored in a record:
// only public data (order hash, tx hashes, amounts, token addresses, timestamps).
//
// Stages (in order): preparing -> signing -> approving -> submitting -> submitted -> filling -> filled
// Final: filled | expired | cancelled | failed
export const FINAL = ["filled", "expired", "cancelled", "failed"];
export const isFinal = (stage) => FINAL.includes(stage);

// Timeline shown to the user (approving only when an approval was needed).
export const TIMELINE = [
  { stage: "signing", label: "Signed" },
  { stage: "approving", label: "Approved" },
  { stage: "submitted", label: "Submitted" },
  { stage: "filling", label: "Filling" },
  { stage: "filled", label: "Filled" },
];
const ORDER = ["preparing", "signing", "approving", "submitting", "submitted", "filling", "filled"];
export const stageIndex = (stage) => ORDER.indexOf(stage);

// 1inch Fusion order statuses -> our stage (+ reason). Unknown -> null (keep current stage).
export const mapFusionStatus = (status) => {
  const s = String(status || "").toLowerCase();
  if (!s) return null;
  if (s === "filled") return { stage: "filled" };
  if (s === "partially-filled" || s === "pending") return { stage: "filling" };
  if (s === "expired") return { stage: "expired" };
  if (s === "cancelled" || s === "canceled") return { stage: "cancelled" };
  if (s === "not-enough-balance-or-allowance") return { stage: "failed", reason: "balance" };
  if (s === "false-predicate" || s === "invalid-signature" || s === "wrong-permit") return { stage: "failed", reason: s };
  return null;
};

// The backend's orderStatus response shape isn't documented: read status + fill tx defensively.
export const readStatusResponse = (res) => {
  if (!res || typeof res !== "object") return { status: null, fillTx: null };
  const d = res.data && typeof res.data === "object" ? res.data : res;
  const status = d.status || d.orderStatus || res.status || null;
  const fills = d.fills || res.fills || [];
  const fill = Array.isArray(fills) ? fills.find((f) => f && f.txHash) : null;
  return { status: typeof status === "string" ? status : null, fillTx: fill ? fill.txHash : null };
};

const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
// When the order can no longer fill: auction length (from the quote) + margin. Default auction 3 min.
export const expiryFor = (createdAt, auctionSeconds) => createdAt + (Number(auctionSeconds) > 0 ? Number(auctionSeconds) : 180) * 1000 + EXPIRY_MARGIN_MS;

const big = (x) => {
  try {
    return BigInt(String(x));
  } catch (e) {
    return null;
  }
};

// Apply one tracking result. update: { status (1inch), fillTx, outBalance (raw units now), now }.
// Balance fallback: output token balance grew by >= 95% of the minimum -> filled.
export const applyUpdate = (record, update) => {
  if (!record || isFinal(record.stage)) return record;
  const now = update.now || Date.now();
  const next = { ...record, checkedAt: now };
  const mapped = mapFusionStatus(update.status);
  if (mapped) {
    next.stage = mapped.stage;
    if (mapped.reason) next.reason = mapped.reason;
  }
  if (update.fillTx) next.fillTx = update.fillTx;
  if (!isFinal(next.stage) && update.outBalance != null && record.outBalanceBefore != null && record.minOut) {
    const before = big(record.outBalanceBefore);
    const nowBal = big(update.outBalance);
    const min = big(record.minOut);
    if (before !== null && nowBal !== null && min !== null && nowBal - before >= (min * BigInt(95)) / BigInt(100)) {
      next.stage = "filled";
      next.filledBy = "balance";
    }
  }
  if (!isFinal(next.stage) && record.expiresAt && now > record.expiresAt) {
    next.stage = "expired";
  }
  if (isFinal(next.stage) && !next.doneAt) next.doneAt = now;
  return next;
};

// Duplicate guard: no new order while another one for this wallet is still open (not final and
// not past expiry), or one was started in the last 15 s (double tap).
export const canStartOrder = (records, now = Date.now()) => {
  const open = (records || []).find((r) => !isFinal(r.stage) && (!r.expiresAt || now <= r.expiresAt));
  if (open) return { ok: false, reason: "open", record: open };
  const recent = (records || []).find((r) => now - (r.createdAt || 0) < 15000);
  if (recent) return { ok: false, reason: "recent", record: recent };
  return { ok: true };
};

// Quotes go stale quickly: require a fresh one for Confirm.
export const QUOTE_MAX_AGE_MS = 45000;
export const quoteIsFresh = (quotedAt, now = Date.now()) => !!quotedAt && now - quotedAt <= QUOTE_MAX_AGE_MS;

export const STAGE_TEXT = {
  preparing: "Preparing your order…",
  signing: "Signing the order in your wallet…",
  approving: "Approving the exact amount (one network fee)…",
  submitting: "Sending the order…",
  submitted: "Order sent. Waiting for a filler…",
  filling: "Filling…",
  filled: "Done. The tokens are in your wallet.",
  expired: "Not filled in time. Nothing was taken — your funds stay in your wallet.",
  cancelled: "Order cancelled. Your funds stay in your wallet.",
  failed: "The order couldn't be filled. Your funds stay in your wallet.",
  unknown: "Status unknown — check your wallet before trying again.",
};
