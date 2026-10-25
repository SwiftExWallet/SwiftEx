import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECOVERY_REGISTERED_WALLETS_KEY ='recovery_wallets';
export const RECOVERY_DESTINATIONS_KEY = 'recovery_destinations';

function normalizeWalletAddress(walletAddress) {
  return String(walletAddress || '').trim().toUpperCase();
}

async function readRegisteredWallets() {
  const stored = await AsyncStorage.getItem(RECOVERY_REGISTERED_WALLETS_KEY);
  if (!stored) return [];

  try {
    const wallets = JSON.parse(stored);
    return Array.isArray(wallets)
      ? wallets
          .filter(wallet => typeof wallet === 'string')
          .map(normalizeWalletAddress)
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function readRecoveryDestinations() {
  const stored = await AsyncStorage.getItem(RECOVERY_DESTINATIONS_KEY);
  if (!stored) return {};

  try {
    const destinations = JSON.parse(stored);
    if (!destinations || Array.isArray(destinations) || typeof destinations !== 'object')
      return {};
    return Object.entries(destinations).reduce((result, [wallet, destination]) => {
      const normalizedWallet = normalizeWalletAddress(wallet);
      const normalizedDestination = normalizeWalletAddress(destination);
      if (normalizedWallet && normalizedDestination)
        result[normalizedWallet] = normalizedDestination;
      return result;
    }, {});
  } catch {
    return {};
  }
}

export async function isRecoveryWalletRegistered(walletAddress) {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return false;
  const wallets = await readRegisteredWallets();
  return wallets.includes(normalized);
}

export async function rememberRecoveryWallet(walletAddress) {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return;

  const wallets = await readRegisteredWallets();
  const next = Array.from(new Set([...wallets, normalized]));
  await AsyncStorage.setItem(
    RECOVERY_REGISTERED_WALLETS_KEY,
    JSON.stringify(next),
  );
}

export async function rememberRecoveryDestination(walletAddress, destinationAddress) {
  const wallet = normalizeWalletAddress(walletAddress);
  const destination = normalizeWalletAddress(destinationAddress);
  if (!wallet || !destination) return;

  const destinations = await readRecoveryDestinations();
  await AsyncStorage.setItem(
    RECOVERY_DESTINATIONS_KEY,
    JSON.stringify({...destinations, [wallet]: destination}),
  );
}

export async function getRecoveryDestination(walletAddress) {
  const wallet = normalizeWalletAddress(walletAddress);
  if (!wallet) return '';
  const destinations = await readRecoveryDestinations();
  return destinations[wallet] || '';
}

export async function forgetRecoveryDestination(walletAddress) {
  const wallet = normalizeWalletAddress(walletAddress);
  if (!wallet) return;
  const destinations = await readRecoveryDestinations();
  if (!destinations[wallet]) return;
  delete destinations[wallet];
  await AsyncStorage.setItem(
    RECOVERY_DESTINATIONS_KEY,
    JSON.stringify(destinations),
  );
}
