import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECOVERY_REGISTERED_WALLETS_KEY ='recovery_wallets';

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
