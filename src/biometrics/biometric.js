import ReactNativeBiometrics from 'react-native-biometrics'
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { CHALLENGE_OPT } from '../Dashboard/constants';

const rnBiometrics = new ReactNativeBiometrics({
  allowDeviceCredentials: true
})

const ensureBiometricKeys = async () => {
  const { keysExist } = await rnBiometrics.biometricKeysExist();
  if (!keysExist) await rnBiometrics.createKeys();
};

const biometricChallenge = async (promptMessage = 'Authenticate to access wallet') => {
  try {
    await ensureBiometricKeys();
    const payload = `${CHALLENGE_OPT}+${Date.now()}`;
    return await rnBiometrics.createSignature({ promptMessage, payload });
  } catch (error) {
    console.warn('biometricChallenge error:', error?.message);
    return { success: false, error };
  }
};

export function enableBiometrics() {
  biometricChallenge('Enable biometrics for SwiftEx')
    .then(async ({ success }) => {
      if (success) await AsyncStorageLib.setItem('Biometric', 'SET');
    });
}

export function enable_face_id() {
  biometricChallenge('Enable Face ID for SwiftEx')
    .then(async ({ success }) => {
      if (success) await AsyncStorageLib.setItem('Biometric', 'SET');
    });
}

export function useBiometrics(navigation) {
  biometricChallenge('Confirm fingerprint to continue')
    .then(({ success }) => {
      if (success) navigation.navigate('HomeScreen');
    });
}

export async function useBiometrics_run() {
  try {
    const { success } = await biometricChallenge('Confirm fingerprint');
    return !!success;
  } catch { return false; }
}

export function useBiometricsForAppLock(navigation) {
  biometricChallenge('Confirm fingerprint to unlock')
    .then(({ success }) => {
      if (success) navigation.goBack();
    });
}

export function useBiometricsForSendTransaction(fn) {
  biometricChallenge('Confirm fingerprint to sign transaction')
    .then(({ success }) => {
      if (success) fn();
    });
}

export async function useBiometricsForSwapTransaction(fn) {
  const { success } = await biometricChallenge('Confirm fingerprint to sign swap');
  if (success) await fn();
}

export function getBiometrics() {
  rnBiometrics.isSensorAvailable()
    .then(({ available }) => {
      if (available) enableBiometrics();
    });
}

export function turnOffBiometrics() {
  AsyncStorageLib.setItem('Biometric', 'UNSET');
  rnBiometrics.deleteKeys().catch(() => {});
}