// Maps an EVM address to its Stellar public key.
//
// Source of truth is the native active wallet (keychain / encrypted prefs), which holds
// the Stellar key that can actually sign. The AsyncStorage list "myDataKey" is only a
// fallback cache and keeps at most ONE entry per EVM address (latest wins), so a
// re-imported wallet can never resolve to the Stellar key of a deleted wallet.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const KEY = 'myDataKey';
const lc = (a) => String(a ?? '').toLowerCase();
const entryAddr = (e) => e?.Ether_address ?? e?.etherAddress;

const readList = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

/** Replace any existing entries for this EVM address with the new Stellar key. */
export const upsertStellarKey = async (etherAddress, publicKey) => {
  if (!etherAddress || !publicKey) return;
  const list = (await readList()).filter((e) => lc(entryAddr(e)) !== lc(etherAddress));
  list.push({ Ether_address: etherAddress, publicKey });
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
};

/** Drop cached entries for an EVM address (call when its wallet is deleted). */
export const removeStellarKey = async (etherAddress) => {
  if (!etherAddress) return;
  const list = (await readList()).filter((e) => lc(entryAddr(e)) !== lc(etherAddress));
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
};

/**
 * Resolve the Stellar key for `etherAddress`. Returns { Ether_address, publicKey } or null.
 * Prefers the native active wallet; otherwise the NEWEST cache entry.
 */
export const resolveStellarKey = async (etherAddress) => {
  if (!etherAddress) return null;
  try {
    const res = await NativeModules.StorageModule?.getWalletAddress?.();
    const w = res?.success ? res.wallet : null;
    if (w && lc(w.address) === lc(etherAddress) && w.stellarPublicKey) {
      return { Ether_address: w.address, publicKey: w.stellarPublicKey };
    }
  } catch (_) { /* fall back to cache */ }

  const list = await readList();
  for (let i = list.length - 1; i >= 0; i--) {
    if (lc(entryAddr(list[i])) === lc(etherAddress) && list[i].publicKey) {
      return { Ether_address: entryAddr(list[i]), publicKey: list[i].publicKey };
    }
  }
  return null;
};
