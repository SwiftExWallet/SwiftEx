import { Linking, NativeEventEmitter, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeChottuLink, handleLink } from 'react-native-chottulink-sdk';

const STORAGE_KEY = 'referral_code';
const { ChottuLinkEventEmitter } = NativeModules;
const eventEmitter = new NativeEventEmitter(ChottuLinkEventEmitter);

let initialized = false;


export function initReferral(apiKey) {
  if (initialized) return;
  initializeChottuLink(apiKey);
  initialized = true;
}


function extractCodeFromUrl(url) {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    return code;
  } catch (e) {
    console.log('Parse error:', e);
    return null;
  }
}


async function saveReferralCode(code) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch (e) {
  }
}


export async function getSavedReferralCode() {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}


export function subscribeReferral(onCode) {
  const handleCode = (code) => {
    if (!code) return;
    saveReferralCode(code);
    onCode(code);
  };

  const resolvedSub = eventEmitter.addListener('ChottuLinkDeepLinkResolved', (data) => {
    const url = data?.metadata?.shortLinkRaw || data?.url;
    if (url) handleCode(extractCodeFromUrl(url));
  });

  const errorSub = eventEmitter.addListener('ChottuLinkDeepLinkError', (data) => {
  });

  Linking.getInitialURL().then((initialUrl) => {
    if (initialUrl) {
      handleLink(initialUrl);
      handleCode(extractCodeFromUrl(initialUrl));
    }
  });

  const linkingSub = Linking.addEventListener('url', (event) => {
    handleLink(event.url);
    handleCode(extractCodeFromUrl(event.url));
  });

  return () => {
    resolvedSub?.remove();
    errorSub?.remove();
    linkingSub?.remove();
  };
}

export async function clearReferralCode() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
  }
}