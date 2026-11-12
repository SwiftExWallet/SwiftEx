/*
 * Perps agent (trading) key store — the ONLY place the agent private key is persisted.
 *
 * TODO(Hunny): replace the INSIDE of saveAgent / getAgent / removeAgent with native secure
 * storage (Android EncryptedSharedPreferences via StorageModule, iOS Keychain).
 * Keep the same function names, arguments and return values; nothing else should need to change.
 * Once that is done, remove the __DEV__ safety lock below (and the UI lock that uses
 * isAgentStoreAvailable()).
 *
 * TEMPORARY implementation: AsyncStorage (NOT encrypted). SAFETY LOCK: it only works in
 * development builds (__DEV__). In release builds every call throws, and the UI disables
 * "Enable Trading" ("Trading coming soon").
 *
 * Stored value (JSON): { pk, address, expiresAt, createdAt }
 * Key: perps_aster_agent_<lowercase main EVM address>
 * Never log the value or the private key.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "perps_aster_agent_";

export const isAgentStoreAvailable = () => __DEV__ === true;

const assertAvailable = () => {
  if (!isAgentStoreAvailable()) {
    throw new Error("Perps trading key storage is not available in this build");
  }
};

const keyFor = (mainAddress) => {
  if (!mainAddress || typeof mainAddress !== "string") {
    throw new Error("Missing wallet address");
  }
  return `${KEY_PREFIX}${mainAddress.toLowerCase()}`;
};

export const saveAgent = async (mainAddress, data) => {
  assertAvailable();
  const value = {
    pk: data.pk,
    address: data.address,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
  };
  if (!value.pk || !value.address) throw new Error("Invalid agent data");
  await AsyncStorage.setItem(keyFor(mainAddress), JSON.stringify(value));
};

// Resolves to { pk, address, expiresAt, createdAt } or null.
export const getAgent = async (mainAddress) => {
  assertAvailable();
  const raw = await AsyncStorage.getItem(keyFor(mainAddress));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.pk && parsed.address ? parsed : null;
  } catch (e) {
    return null;
  }
};

export const removeAgent = async (mainAddress) => {
  assertAvailable();
  await AsyncStorage.removeItem(keyFor(mainAddress));
};
