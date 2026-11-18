// Persisted RWA order records per wallet (AsyncStorage; public data only, never keys/signatures).
// Survives closing the screen and killing the app; the tracker resumes open records.
import AsyncStorage from "@react-native-async-storage/async-storage";

const MAX = 20;
const keyFor = (wallet) => `rwa_orders_${String(wallet || "").toLowerCase()}`;
const listeners = new Set();
const cache = new Map(); // wallet -> records

export const loadOrders = async (wallet) => {
  if (!wallet) return [];
  if (cache.has(wallet)) return cache.get(wallet);
  try {
    const raw = await AsyncStorage.getItem(keyFor(wallet));
    const list = raw ? JSON.parse(raw) : [];
    cache.set(wallet, Array.isArray(list) ? list : []);
  } catch (e) {
    cache.set(wallet, []);
  }
  return cache.get(wallet);
};

const save = async (wallet, list) => {
  const trimmed = list.slice(0, MAX);
  cache.set(wallet, trimmed);
  listeners.forEach((fn) => fn(wallet, trimmed));
  try {
    await AsyncStorage.setItem(keyFor(wallet), JSON.stringify(trimmed));
  } catch (e) {
    // keep in memory; next save retries
  }
  return trimmed;
};

// Insert or replace by id (newest first).
export const upsertOrder = async (wallet, record) => {
  const list = await loadOrders(wallet);
  const rest = list.filter((r) => r.id !== record.id);
  return save(wallet, [record, ...rest]);
};

// Replace a temporary id (before the order hash is known) with the real one.
export const renameOrder = async (wallet, oldId, record) => {
  const list = await loadOrders(wallet);
  const rest = list.filter((r) => r.id !== oldId && r.id !== record.id);
  return save(wallet, [record, ...rest]);
};

export const subscribeOrders = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const __test = { reset: () => cache.clear() };
