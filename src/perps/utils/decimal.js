// String-based decimal math on top of ethers v5 BigNumber (fixed 18 decimals).
// No JS float arithmetic for quantity / price / amount.
import { BigNumber, utils } from "ethers";

export const SCALE = 18;
const ONE = BigNumber.from(10).pow(SCALE);

// Any number/string -> plain decimal string ("1e-7" -> "0.0000001"). Returns null if invalid.
export const toPlain = (value) => {
  if (value === null || value === undefined) return null;
  if (BigNumber.isBigNumber(value)) return value.toString();
  let s = typeof value === "number" ? (Number.isFinite(value) ? String(value) : null) : String(value).trim();
  if (s === null || s === "") return null;
  s = s.replace(/,/g, "");
  if (/e/i.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    // toFixed is exact enough to *render* the number; it is only used to read inputs/API values.
    s = n.toFixed(20);
  }
  if (!/^-?\d*\.?\d*$/.test(s) || s === "." || s === "-" || s === "-.") return null;
  if (s.startsWith(".")) s = `0${s}`;
  if (s.startsWith("-.")) s = `-0${s.slice(1)}`;
  return s;
};

// Decimal string -> BigNumber scaled by 1e18 (extra decimals truncated).
export const toUnits = (value) => {
  const s = toPlain(value);
  if (s === null) throw new Error("Invalid number");
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const [i, f = ""] = abs.split(".");
  const bn = utils.parseUnits(`${i || "0"}.${(f + "0").slice(0, SCALE)}`, SCALE);
  return neg ? bn.mul(-1) : bn;
};

// BigNumber (1e18 scaled) -> trimmed decimal string, optionally fixed to `decimals`.
export const fromUnits = (bn, decimals) => {
  let s = utils.formatUnits(bn, SCALE);
  if (decimals !== undefined && decimals !== null) {
    const neg = s.startsWith("-");
    const abs = neg ? s.slice(1) : s;
    const [i, f = ""] = abs.split(".");
    const frac = (f + "0".repeat(decimals)).slice(0, decimals);
    s = `${neg ? "-" : ""}${i}${decimals > 0 ? `.${frac}` : ""}`;
    return s;
  }
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
};

export const isValid = (value) => {
  try {
    toUnits(value);
    return true;
  } catch (e) {
    return false;
  }
};

export const decimalsOf = (step) => {
  const s = toPlain(step);
  if (!s || !s.includes(".")) return 0;
  return s.split(".")[1].replace(/0+$/, "").length;
};

export const add = (a, b) => fromUnits(toUnits(a).add(toUnits(b)));
export const sub = (a, b) => fromUnits(toUnits(a).sub(toUnits(b)));
export const mul = (a, b) => fromUnits(toUnits(a).mul(toUnits(b)).div(ONE));
export const div = (a, b) => {
  const d = toUnits(b);
  if (d.isZero()) throw new Error("Division by zero");
  return fromUnits(toUnits(a).mul(ONE).div(d));
};
export const cmp = (a, b) => {
  const x = toUnits(a);
  const y = toUnits(b);
  return x.gt(y) ? 1 : x.lt(y) ? -1 : 0;
};
export const gt = (a, b) => cmp(a, b) > 0;
export const gte = (a, b) => cmp(a, b) >= 0;
export const lt = (a, b) => cmp(a, b) < 0;
export const lte = (a, b) => cmp(a, b) <= 0;
export const isPositive = (a) => isValid(a) && toUnits(a).gt(0);
export const min = (a, b) => (lte(a, b) ? fromUnits(toUnits(a)) : fromUnits(toUnits(b)));

// Round DOWN (towards zero) to a multiple of step, rendered with the step's decimals.
export const floorToStep = (value, step) => {
  const v = toUnits(value);
  const st = toUnits(step);
  if (st.lte(0)) throw new Error("Invalid step");
  return fromUnits(v.div(st).mul(st), decimalsOf(step));
};

// Round UP to a multiple of step.
export const ceilToStep = (value, step) => {
  const v = toUnits(value);
  const st = toUnits(step);
  if (st.lte(0)) throw new Error("Invalid step");
  const q = v.div(st);
  const exact = q.mul(st).eq(v);
  return fromUnits((exact ? q : q.add(1)).mul(st), decimalsOf(step));
};

// Round to the NEAREST multiple of step (half up), rendered with the step's decimals.
export const roundToStep = (value, step) => {
  const v = toUnits(value);
  const st = toUnits(step);
  if (st.lte(0)) throw new Error("Invalid step");
  return fromUnits(v.add(st.div(2)).div(st).mul(st), decimalsOf(step));
};

// Token amount helpers (e.g. USDT with 18 decimals on BSC).
export const toTokenUnits = (value, tokenDecimals) => {
  const s = fromUnits(toUnits(value), tokenDecimals); // truncate to token decimals
  return utils.parseUnits(s, tokenDecimals);
};
export const fromTokenUnits = (bn, tokenDecimals) => {
  let s = utils.formatUnits(bn, tokenDecimals);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
};
