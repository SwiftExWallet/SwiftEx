// US-stock session calendar for tokenized stocks, computed locally (no API key needed).
// Ondo Global Markets (docs.ondo.finance, ET):
//   overnight 8:05pm–3:55am (belongs to the NEXT trading day), pre-market 4:01–9:29am,
//   core 9:31am–3:59pm, post-market 4:01–7:59pm; closed weekends + NYSE holidays; short pauses
//   between sessions are shown as Closed. Early closes (half days) are not modelled.
// xStocks list badges use the same calendar; the asset page asks the xStocks status API instead.
// Gold / treasuries: 24/7.

// NYSE full-day holidays (update yearly). Source: nyse.com/markets/hours-calendars.
export const NYSE_HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05",
  "2027-09-06", "2027-11-25", "2027-12-24",
  // 2028
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19", "2028-07-04", "2028-09-04",
  "2028-11-23", "2028-12-25",
]);

const DAY_MS = 86400000;

// n-th Sunday (1-based) of month m (0-based) in year y, as a UTC day number.
const nthSunday = (y, m, n) => {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
};

// US Eastern offset from UTC in hours (-4 in DST, -5 otherwise) for a UTC instant.
// DST: 2nd Sunday of March 2:00 EST (07:00 UTC) → 1st Sunday of November 2:00 EDT (06:00 UTC).
export const easternOffset = (date) => {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 2, nthSunday(y, 2, 2), 7);
  const end = Date.UTC(y, 10, nthSunday(y, 10, 1), 6);
  const t = date.getTime();
  return t >= start && t < end ? -4 : -5;
};

// Local ET calendar parts for a UTC instant.
export const toEastern = (date) => {
  const local = new Date(date.getTime() + easternOffset(date) * 3600000);
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const d = local.getUTCDate();
  const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { iso, dow: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes(), dayStart: Date.UTC(y, mo, d) };
};

const isoOf = (dayStartUtc) => new Date(dayStartUtc).toISOString().slice(0, 10);

export const isTradingDay = (iso) => {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !NYSE_HOLIDAYS.has(iso);
};

// Session at an instant: "core" | "pre" | "post" | "overnight" | "closed".
export const usSession = (date) => {
  const { iso, minutes, dayStart } = toEastern(date);
  if (minutes >= 20 * 60 + 5) return isTradingDay(isoOf(dayStart + DAY_MS)) ? "overnight" : "closed";
  if (minutes < 3 * 60 + 55) return isTradingDay(iso) ? "overnight" : "closed";
  if (!isTradingDay(iso)) return "closed";
  if (minutes >= 4 * 60 + 1 && minutes < 9 * 60 + 30) return "pre";
  if (minutes >= 9 * 60 + 31 && minutes < 16 * 60) return "core";
  if (minutes >= 16 * 60 + 1 && minutes < 20 * 60) return "post";
  return "closed"; // pause between sessions
};

// Next instant (minute precision, within 8 days) when the session is not "closed".
export const nextOpen = (date) => {
  const start = Math.ceil(date.getTime() / 60000) * 60000;
  for (let i = 0; i <= 8 * 24 * 60; i += 1) {
    const t = new Date(start + i * 60000);
    if (usSession(t) !== "closed") return t;
  }
  return null;
};

export const SESSION_LABEL = {
  core: "Open",
  pre: "Pre-market",
  post: "After hours",
  overnight: "Overnight",
  closed: "Closed",
  halted: "Halted",
  "24-7": "Open 24/7",
};

// Badge status for an asset: { status, label, open }.
export const assetMarketStatus = (asset, now = new Date()) => {
  if (!asset || asset.marketHours === "24-7") return { status: "24-7", label: SESSION_LABEL["24-7"], open: true };
  const s = usSession(now);
  return { status: s, label: SESSION_LABEL[s], open: s !== "closed" };
};

// xStocks API trading block -> our status (asset page).
export const xstocksStatus = (trading) => {
  if (!trading) return null;
  if (trading.isTradingHalted) return { status: "halted", label: SESSION_LABEL.halted, open: false };
  const map = { market: "core", extended: "post", premarket: "pre", overnight: "overnight", closed: "closed" };
  let s = map[trading.currentPeriod] || (trading.openNow ? "core" : "closed");
  if (s === "post" && trading.currentPeriod === "extended") {
    // "extended" covers both pre- and post-market: decide by ET clock.
    s = toEastern(new Date()).minutes < 12 * 60 ? "pre" : "post";
  }
  if (!trading.openNow) s = "closed";
  return { status: s, label: SESSION_LABEL[s], open: s !== "closed", nextChangeAt: trading.nextChangeAt || null };
};

// "Opens Mon 4:01 AM ET" style text.
export const formatEastern = (date) => {
  if (!date) return "";
  const { dow, minutes } = toEastern(date);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${days[dow]} ${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} ET`;
};
