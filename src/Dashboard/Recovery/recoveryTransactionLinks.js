import {STELLAR_URL} from '../constants';
import {Linking} from 'react-native';

export function recoveryTransactionUrl(transactionHash) {
  const hash = String(transactionHash || '').trim();
  return hash ? `${STELLAR_URL.EXPERT_URL}/tx/${hash}` : '';
}

export async function openRecoveryTransaction(transactionHash, linking = Linking) {
  const url = recoveryTransactionUrl(transactionHash);
  try {
    if (!url) return false;
    await linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
