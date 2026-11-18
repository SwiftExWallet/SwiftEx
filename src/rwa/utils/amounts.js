// Amount / decimals helpers (strings + ethers BigNumber; never floats for on-chain amounts).
import { ethers } from "ethers";

// Clean user input: digits + one dot, max `decimals` fraction digits. Returns "" if invalid.
export const cleanAmountInput = (text, decimals = 6) => {
  let t = String(text || "").replace(",", ".").replace(/[^0-9.]/g, "");
  const dot = t.indexOf(".");
  if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "");
  if (t.startsWith(".")) t = `0${t}`;
  const [i, f] = t.split(".");
  if (f !== undefined && f.length > decimals) t = `${i}.${f.slice(0, decimals)}`;
  return t;
};

// "1.5" + 6 -> "1500000". Returns null for empty / zero / invalid.
export const toUnits = (amount, decimals) => {
  const a = cleanAmountInput(amount, decimals);
  if (!a || !/[1-9]/.test(a)) return null;
  try {
    return ethers.utils.parseUnits(a, decimals).toString();
  } catch (e) {
    return null;
  }
};

// "1500000" + 6 -> "1.5"
export const fromUnits = (units, decimals) => {
  if (units === null || units === undefined || units === "") return null;
  try {
    const s = ethers.utils.formatUnits(ethers.BigNumber.from(String(units)), decimals);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  } catch (e) {
    return null;
  }
};

// Compare unit strings: a >= b
export const gteUnits = (a, b) => {
  try {
    return ethers.BigNumber.from(String(a)).gte(ethers.BigNumber.from(String(b)));
  } catch (e) {
    return false;
  }
};

// Display helpers (UI only).
export const fmtUsd = (n, max = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const digits = Math.abs(v) < 1 && v !== 0 ? Math.max(max, 4) : max;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })}`;
};

export const fmtAmount = (s, maxFrac = 6) => {
  if (s === null || s === undefined) return "—";
  const [i, f = ""] = String(s).split(".");
  const fr = f.slice(0, maxFrac).replace(/0+$/, "");
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fr ? `${int}.${fr}` : int;
};

export const fmtPct = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
};
