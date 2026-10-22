import { REACT_APP_HOST } from '../exchange/crypto-exchange-front-end-main/src/ExchangeConstants';

export const DEFAULT_PROOF_API_URL =REACT_APP_HOST

export function normalizeRecoveryStatus(result = {}) {
  const pending = result?.pending || null;
  const status = result?.status || (pending ? 'PENDING' : '');
  const isActive = ['STARTED', 'PENDING', 'EXECUTING'].includes(status);
  return {
    attemptId: String(result?.attemptId || result?._id || ''),
    status,
    isActive,
    destination: result?.destination || pending?.destination || '',
    unlockAt: result?.unlockAt ?? pending?.unlockAt ?? null,
    error: result?.error || '',
  };
}

export function createRecoveryApi(_baseUrl = DEFAULT_PROOF_API_URL, request) {
  async function call(path, methodName, body, owner) {
    const api = require('../exchange/crypto-exchange-front-end-main/src/api');
    const proxyRequest = request || api.proxyRequest;
    const {PGET, PPOST} = api;
    const method = methodName === 'GET' ? PGET : PPOST;
    const result = await proxyRequest(path, method, body, owner);
    if (result?.err) {
      const error = new Error(result.err.message || 'Recovery API failed');
      error.isRecoveryApiError = true;
      throw error;
    }
    return result?.res;
  }

  return {
    async startRecovery({owner, file}) {
      if (!owner) throw new Error('Original wallet address is required');
      if (!file?.uri) throw new Error('Select the delivered .eml file first');
      const form = new FormData();
      form.append('owner', owner);
      form.append('eml', {
        uri: file.uri,
        name: file.name || 'recovery.eml',
        type: file.type || 'message/rfc822',
      });
      return call('/v1/recovery/start', 'POST', form, owner);
    },

    getRecoveryStatus(owner) {
      return call(`/v1/recovery/${encodeURIComponent(owner)}`, 'GET', undefined, owner)
        .then(normalizeRecoveryStatus);
    },

    executeRecovery(owner) {
      return call('/v1/recovery/execute', 'POST', {owner}, owner);
    },

    saveRecoveryRegistration({email, walletAddress}) {
      return call(
        '/v1/recovery/registration',
        'POST',
        {email, walletAddress},
        walletAddress,
      );
    },

    prepareRecoveryRegistration({email, walletAddress, assets}) {
      return call('/v1/recovery/registration/prepare', 'POST', {email, walletAddress, assets}, walletAddress);
    },

    confirmRecoveryRegistration({email, walletAddress, transactionHash}) {
      return call('/v1/recovery/registration/confirm', 'POST', {email, walletAddress, transactionHash}, walletAddress);
    },

    prepareRecoveryCancellation(owner) {
      return call('/v1/recovery/cancel/prepare', 'POST', {owner}, owner);
    },

    confirmRecoveryCancellation({owner, transactionHash}) {
      return call('/v1/recovery/cancel/confirm', 'POST', {owner, transactionHash}, owner);
    },
  };
}

export default createRecoveryApi();
