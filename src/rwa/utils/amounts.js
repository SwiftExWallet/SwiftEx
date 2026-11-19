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

// Small numbers with significant digits: 0.0000412 -> "0.000041" (sig = 2). Never "0" for a
// non-zero value; >= 1 -> up to 4 decimals.
export const fmtSig = (n, sig = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1) return String(Number(v.toFixed(4)));
  const digits = Math.min(18, Math.ceil(-Math.log10(a)) + sig - 1);
  return v.toFixed(digits).replace(/(\.\d*?[1-9])0+$/, "$1");
};

// Gas cost line: "≈0.000041 BNB (~$0.03)"; USD part omitted if no price; "<$0.01" for tiny values.
export const nativeCostText = (weiString, nativeSymbol, nativeUsd) => {
  let n;
  try {
    n = Number(ethers.utils.formatEther(ethers.BigNumber.from(String(weiString))));
  } catch (e) {
    return "—";
  }
  const usd = Number.isFinite(nativeUsd) && nativeUsd > 0 ? n * nativeUsd : null;
  const usdTxt = usd === null ? "" : usd > 0 && usd < 0.01 ? " (<$0.01)" : ` (~$${usd.toFixed(2)})`;
  return `≈${fmtSig(n, 2)} ${nativeSymbol}${usdTxt}`;
};

export const fmtPct = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
};
