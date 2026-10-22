import {NativeModules} from 'react-native';
import * as StellarSdk from '@stellar/stellar-sdk';
import {SRB_RPC_URL, STELLAR_URL} from '../constants';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidStellarAddress(address) {
  return /^G[A-Z2-7]{55}$/.test(String(address || '').trim());
}

export async function isStellarWalletActivated(address) {
  const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
  try {
    await server.loadAccount(String(address || '').trim());
    return true;
  } catch (error) {
    if (error?.response?.status === 404 || error?.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

export async function fetchRecoveryAssets(address) {
  const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
  const account = await server.loadAccount(String(address || '').trim());

  return (account.balances || []).flatMap(balance => {
    if (balance.asset_type === 'native') {
      return [{
        key: 'native:native',
        type: 'native',
        code: 'XLM',
        balance: balance.balance || '0',
        floor: '20000000',
      }];
    }

    if (
      (balance.asset_type === 'credit_alphanum4' ||
        balance.asset_type === 'credit_alphanum12') &&
      balance.asset_code &&
      balance.asset_issuer
    ) {
      return [{
        key: `classic:${balance.asset_issuer}:${balance.asset_code}`,
        type: 'classic',
        code: balance.asset_code,
        issuer: balance.asset_issuer,
        balance: balance.balance || '0',
        floor: '0',
      }];
    }

    return [];
  });
}

export async function signAndBroadcastRecoveryTransaction(unsignedXdr) {
  const signer = NativeModules.StellarSigner;
  if (!signer?.signTransaction) throw new Error('Native StellarSigner is not available');
  const signed = await signer.signTransaction(unsignedXdr);
  let signedXdr = signed?.signedXDR;
  if (!signedXdr && signed?.signature && signed?.publicKey) {
    const tx = StellarSdk.TransactionBuilder.fromXDR(unsignedXdr, StellarSdk.Networks.TESTNET);
    tx.addSignature(signed.publicKey, Buffer.from(signed.signature, 'base64').toString('base64'));
    signedXdr = tx.toXDR();
  }
  if (!signedXdr) throw new Error('Native signer returned no signed transaction');
  const server = new StellarSdk.rpc.Server(SRB_RPC_URL);
  const sent = await server.sendTransaction(StellarSdk.TransactionBuilder.fromXDR(signedXdr, StellarSdk.Networks.TESTNET));
  if (sent.status === 'ERROR') throw new Error('Stellar transaction rejected');
  const complete = await server.pollTransaction(sent.hash, {attempts: 30, sleepStrategy: () => 1000});
  if (complete.status !== 'SUCCESS') throw new Error(`Stellar transaction did not succeed: ${complete.status}`);
  return sent.hash;
}
