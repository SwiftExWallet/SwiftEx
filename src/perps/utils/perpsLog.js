// Small diagnostics ring buffer for Perps errors (last 20), in memory + AsyncStorage.
// Stores ONLY: time, step, HTTP method + path (query stripped), HTTP status, Aster code/message,
// platform. Never keys, signatures, signed URLs, request bodies or addresses.
// Viewable from the Perps screen: long-press the "Perps" title (dev and release builds).
const MAX = 20;
const KEY = "perps_error_log_v1";
let entries = null; // newest first
let loading = null;

const storage = () => {
  try {
    // eslint-disable-next-line global-require
    const m = require("@react-native-async-storage/async-storage");
    return m.default || m;
  } catch (e) {
    return null;
  }
};

const platform = () => {
  try {
    // eslint-disable-next-line global-require
    return require("react-native").Platform.OS;
  } catch (e) {
    return "?";
  }
};

const load = () => {
  if (entries) return Promise.resolve(entries);
  if (!loading) {
    const s = storage();
    loading = (s ? s.getItem(KEY) : Promise.resolve(null))
      .then((raw) => {
        try {
          entries = raw ? JSON.parse(raw) : [];
        } catch (e) {
          entries = [];
        }
        if (!Array.isArray(entries)) entries = [];
        return entries;
      })
      .catch(() => {
        entries = [];
        return entries;
      });
  }
  return loading;
};

// Remove anything that could carry secrets (query strings, hex blobs, long tokens).
const scrub = (v, max = 160) =>
  String(v === undefined || v === null ? "" : v)
    .split("?")[0]
    .replace(/0x[0-9a-fA-F]{16,}/g, "0x…")
    .replace(/[A-Za-z0-9+/=_-]{48,}/g, "…")
    .slice(0, max);

export const logPerpsError = (e) => {
  const item = {
    t: Date.now(),
    os: platform(),
    step: scrub(e.step || "", 40),
    path: scrub(e.path || "", 80),
    status: e.status !== undefined && e.status !== null ? Number(e.status) : null,
    code: e.code !== undefined && e.code !== null ? String(e.code).slice(0, 12) : null,
    msg: scrub(e.msg || e.error || ""),
  };
  load().then((list) => {
    entries = [item, ...list].slice(0, MAX);
    const s = storage();
    if (s) s.setItem(KEY, JSON.stringify(entries)).catch(() => {});
  });
};

export const getPerpsErrors = () => load().then((l) => l.slice());

export const clearPerpsErrors = () => {
  entries = [];
  const s = storage();
  if (s) s.removeItem(KEY).catch(() => {});
};

export const formatPerpsErrors = (list) =>
  list.length === 0
    ? "No errors recorded."
    : list
        .map((e) => {
          const d = new Date(e.t);
          const hh = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
          return `${d.getDate()}/${d.getMonth() + 1} ${hh} [${e.os}] ${e.step}${e.path ? ` ${e.path}` : ""}${
            e.status ? ` http ${e.status}` : ""
          }${e.code ? ` code ${e.code}` : ""}${e.msg ? ` — ${e.msg}` : ""}`;
        })
        .join("\n");
