const M = require("../utils/marketHours");

// Helper: an ET wall-clock time -> UTC Date, given the expected offset (-4 EDT / -5 EST).
const et = (iso, hhmm, offset) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.parse(`${iso}T00:00:00Z`) + ((h - offset) * 60 + m) * 60000);
};

test("DST boundaries 2026: Mar 8 07:00 UTC and Nov 1 06:00 UTC", () => {
  expect(M.easternOffset(new Date("2026-03-08T06:59:00Z"))).toBe(-5);
  expect(M.easternOffset(new Date("2026-03-08T07:00:00Z"))).toBe(-4);
  expect(M.easternOffset(new Date("2026-11-01T05:59:00Z"))).toBe(-4);
  expect(M.easternOffset(new Date("2026-11-01T06:00:00Z"))).toBe(-5);
  expect(M.easternOffset(new Date("2027-03-14T07:00:00Z"))).toBe(-4); // 2nd Sunday of March 2027
});

test("weekday sessions (EST, Wed 2026-11-18)", () => {
  const d = "2026-11-18";
  expect(M.usSession(et(d, "03:00", -5))).toBe("overnight");
  expect(M.usSession(et(d, "03:57", -5))).toBe("closed"); // pause
  expect(M.usSession(et(d, "04:01", -5))).toBe("pre");
  expect(M.usSession(et(d, "09:30", -5))).toBe("closed"); // pause
  expect(M.usSession(et(d, "09:31", -5))).toBe("core");
  expect(M.usSession(et(d, "15:59", -5))).toBe("core");
  expect(M.usSession(et(d, "16:01", -5))).toBe("post");
  expect(M.usSession(et(d, "20:02", -5))).toBe("closed");
  expect(M.usSession(et(d, "20:05", -5))).toBe("overnight");
});

test("same wall clock in summer (EDT) maps the same way", () => {
  expect(M.usSession(et("2026-07-15", "09:31", -4))).toBe("core");
  expect(M.usSession(et("2026-07-15", "09:31", -5))).toBe("core"); // 10:31 EDT
  expect(M.usSession(et("2026-07-15", "15:59", -5))).toBe("post"); // 16:59 EDT
});

test("weekend: Friday night and Saturday closed; Sunday 8:05pm opens Monday's overnight", () => {
  expect(M.usSession(et("2026-11-20", "20:05", -5))).toBe("closed"); // Fri night
  expect(M.usSession(et("2026-11-21", "12:00", -5))).toBe("closed"); // Sat
  expect(M.usSession(et("2026-11-22", "20:04", -5))).toBe("closed"); // Sun before open
  expect(M.usSession(et("2026-11-22", "20:05", -5))).toBe("overnight"); // Sun -> Mon session
});

test("holidays: Thanksgiving closed, Wednesday-night overnight before it closed too", () => {
  expect(M.isTradingDay("2026-11-26")).toBe(false);
  expect(M.usSession(et("2026-11-26", "10:00", -5))).toBe("closed");
  expect(M.usSession(et("2026-11-25", "21:00", -5))).toBe("closed"); // belongs to Thu (holiday)
  expect(M.usSession(et("2026-11-26", "20:05", -5))).toBe("overnight"); // -> Fri 27th
  expect(M.usSession(et("2027-07-05", "10:00", -4))).toBe("closed"); // Jul 4 observed Monday
});

test("nextOpen from Saturday is Sunday 8:05pm ET", () => {
  const n = M.nextOpen(et("2026-11-21", "12:00", -5));
  expect(n.toISOString()).toBe(et("2026-11-22", "20:05", -5).toISOString());
  expect(M.formatEastern(n)).toBe("Sun 8:05 PM ET");
});

test("asset badges: gold 24/7, stocks follow the calendar", () => {
  const sat = et("2026-11-21", "12:00", -5);
  expect(M.assetMarketStatus({ marketHours: "24-7" }, sat)).toMatchObject({ status: "24-7", open: true });
  expect(M.assetMarketStatus({ marketHours: "ondo-24-5" }, sat)).toMatchObject({ status: "closed", label: "Closed", open: false });
});

test("xStocks API status: halted wins; closed when not open", () => {
  expect(M.xstocksStatus({ isTradingHalted: true, openNow: true, currentPeriod: "market" }).status).toBe("halted");
  expect(M.xstocksStatus({ isTradingHalted: false, openNow: true, currentPeriod: "market" }).status).toBe("core");
  expect(M.xstocksStatus({ isTradingHalted: false, openNow: false, currentPeriod: "closed" }).status).toBe("closed");
  expect(M.xstocksStatus({ isTradingHalted: false, openNow: true, currentPeriod: "overnight" }).label).toBe("Overnight");
  expect(M.xstocksStatus(null)).toBeNull();
});
