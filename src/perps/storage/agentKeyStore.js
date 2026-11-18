/*
 * Perps agent (trading) key store — the ONLY place the agent private key is persisted.
 *
 * Native secure storage via StorageModule.setSecureItem / getSecureItem / removeSecureItem:
 *   - Android: the app's EncryptedSharedPreferences (same store as the wallets)
 *   - iOS: Keychain, service "org.app.swiftEx.wallet.perps", WhenUnlockedThisDeviceOnly (untested)
 * The native side only accepts keys starting with "perps_aster_agent_".
 *
 * OTA guard: JS can be updated over the air (stallion) and may run on an older native build
 * that does not have these methods. Then isAgentStoreAvailable() is false, trading shows
 * "Trading coming soon", and every call throws. There is NO fallback to AsyncStorage.
 *
 * Migration: development builds used to keep the key in AsyncStorage under the same key name.
 * getAgent() moves such an entry into secure storage once (write, verify read-back, then delete
 * the AsyncStorage copy).
 *
 * Stored value (JSON): { pk, address, expiresAt, createdAt }
 * Key: perps_aster_agent_<lowercase main EVM address>
 * Never log the value or the private key.
 */
import { NativeModules, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "perps_aster_agent_";
const NATIVE_METHODS = ["setSecureItem", "getSecureItem", "removeSecureItem"];

const nativeStore = () => {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  const mod = NativeModules.StorageModule;
  if (!mod) return null;
  return NATIVE_METHODS.every((m) => typeof mod[m] === "function") ? mod : null;
};

export const isAgentStoreAvailable = () => nativeStore() !== null;

const requireStore = () => {
  const store = nativeStore();
  if (!store) throw new Error("Perps trading key storage is not available in this app version");
  return store;
};

const keyFor = (mainAddress) => {
  if (!mainAddress || typeof mainAddress !== "string") {
    throw new Error("Missing wallet address");
  }
  return `${KEY_PREFIX}${mainAddress.toLowerCase()}`;
};

const normalize = (data) => {
  const value = {
    pk: data && data.pk,
    address: data && data.address,
    expiresAt: data && data.expiresAt,
    createdAt: data && data.createdAt,
  };
  return value.pk && value.address ? value : null;
};

const parse = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  try {
    return normalize(JSON.parse(raw));
  } catch (e) {
    return null;
  }
};

// Write and confirm the value can be read back unchanged.
const writeVerified = async (store, key, json) => {
  await store.setSecureItem(key, json);
  const back = await store.getSecureItem(key);
  if (back !== json) throw new Error("Could not save the trading key securely");
};

const removeLegacyCopy = async (key) => {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    // best effort; getAgent retries the cleanup next time
  }
};

export const saveAgent = async (mainAddress, data) => {
  const store = requireStore();
  const value = normalize(data);
  if (!value) throw new Error("Invalid agent data");
  const key = keyFor(mainAddress);
  await writeVerified(store, key, JSON.stringify(value));
  await removeLegacyCopy(key);
};

// Resolves to { pk, address, expiresAt, createdAt } or null.
export const getAgent = async (mainAddress) => {
  const store = requireStore();
  const key = keyFor(mainAddress);
  const secure = parse(await store.getSecureItem(key));
  const legacyRaw = await AsyncStorage.getItem(key).catch(() => null);
  if (secure) {
    if (legacyRaw) await removeLegacyCopy(key); // leftover from an interrupted migration
    return secure;
  }
  if (!legacyRaw) return null;
  // One-time migration from the old AsyncStorage location (development builds only).
  const legacy = parse(legacyRaw);
  if (!legacy) {
    await removeLegacyCopy(key); // unreadable leftover, nothing to keep
    return null;
  }
  await writeVerified(store, key, JSON.stringify(legacy)); // throws -> AsyncStorage copy is kept
  await removeLegacyCopy(key);
  return legacy;
};

export const removeAgent = async (mainAddress) => {
  const store = requireStore();
  const key = keyFor(mainAddress);
  await store.removeSecureItem(key);
  await removeLegacyCopy(key);
};
