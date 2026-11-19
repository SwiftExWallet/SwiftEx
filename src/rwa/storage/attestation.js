// One-time RWA attestation + disclosures acceptance, stored per wallet (no secrets).
import AsyncStorage from "@react-native-async-storage/async-storage";

export const ATTESTATION_VERSION = 2; // bump to ask again when the text changes (2: shorter sheet, 2026-11-19)
const keyFor = (wallet) => `rwa_attestation_${String(wallet || "").toLowerCase()}`;

export const hasAttested = async (wallet) => {
  if (!wallet) return false;
  try {
    const raw = await AsyncStorage.getItem(keyFor(wallet));
    const v = raw ? JSON.parse(raw) : null;
    return !!v && v.version === ATTESTATION_VERSION;
  } catch (e) {
    return false;
  }
};

export const saveAttestation = async (wallet, country) => {
  if (!wallet) return;
  await AsyncStorage.setItem(keyFor(wallet), JSON.stringify({ version: ATTESTATION_VERSION, at: Date.now(), country: country || null }));
};
