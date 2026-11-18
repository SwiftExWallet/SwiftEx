// Number formatting for Perps screens (no Intl dependency).

// "0.1" -> 1, "0.0000100" -> 5, "1" -> 0
export const decimalsFromStep = (step) => {
  if (step === undefined || step === null) return null;
  const s = String(step);
  if (!s.includes(".")) return 0;
  const frac = s.split(".")[1].replace(/0+$/, "");
  return frac.length;
};

const addThousands = (intPart) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const formatNumber = (value, decimals = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const fixed = Math.abs(n).toFixed(Math.max(0, Math.min(decimals, 12)));
  const [i, f] = fixed.split(".");
  return `${n < 0 ? "-" : ""}${addThousands(i)}${f ? `.${f}` : ""}`;
};

// Fallback decimals when tickSize is unknown, based on magnitude.
const autoDecimals = (n) => {
  const a = Math.abs(n);
  if (a >= 1000) return 2;
  if (a >= 1) return 4;
  if (a >= 0.01) return 5;
  return 8;
};

export const formatPrice = (value, tickSize) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const d = decimalsFromStep(tickSize);
  return formatNumber(n, d === null ? autoDecimals(n) : d);
};

export const formatPercent = (value, decimals = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
};

export const formatCompactUsd = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
};

// Funding rate as a percentage: 0.0001 -> "0.0100%"
export const formatFundingRate = (rate) => {
  const n = Number(rate);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(4)}%`;
};

// ms -> "hh:mm:ss"
export const formatCountdown = (ms) => {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  if (!Number.isFinite(total)) return "—";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x) => String(x).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

// Token amount: up to `maxDecimals`, trailing zeros trimmed (1 -> "1", 0.0012300 -> "0.00123").
export const formatAmount = (value, maxDecimals = 6) => {
  const s = formatNumber(value, maxDecimals);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};
