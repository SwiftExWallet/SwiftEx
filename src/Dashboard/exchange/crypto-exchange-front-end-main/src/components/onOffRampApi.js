import {PGET, PPOST, proxyRequest} from '../api';

const normalizeSide = (side) => String(side).toLowerCase();

const invalidResponse = () => ({
  success: false,
  error: 'Invalid on/off-ramp response',
});

const unwrapProxyResult = (result, isValidDirectResponse) => {
  const {res, err} = result || {};

  if (err) {
    return {
      success: false,
      error: err.message || 'Request failed',
      status: err.status,
    };
  }

  if (typeof res?.success === 'boolean') {
    return res;
  }

  if (typeof res?.status === 'boolean') {
    return {success: res.status, data: res.data};
  }

  if (
    res?.success &&
    typeof res.success === 'object' &&
    typeof res.success.status === 'boolean'
  ) {
    return {success: res.success.status, data: res.success.data};
  }

  if (typeof res?.success === 'string') {
    return {success: true, data: res.success};
  }

  if (isValidDirectResponse?.(res)) {
    return {success: true, data: res};
  }

  return invalidResponse();
};

export const parseAlchemyQuoteResult = (result) => {
  let body = result.data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_error) {
      if (!result?.success) {
        return {
          success: false,
          error: result?.error || 'Unable to fetch Alchemy quote',
        };
      }
      return {success: false, error: 'Invalid Alchemy quote response'};
    }
  }

  if (!result?.success) {
    return {
      success: false,
      error:
        body?.returnMsg || result?.error || 'Unable to fetch Alchemy quote',
    };
  }

  if (!body || typeof body !== 'object' || body.data == null) {
    return {success: false, error: 'Invalid Alchemy quote response'};
  }

  return {success: true, data: body.data};
};

export const getBanxaAssetIdentifiers = (
  cryptoSelection,
  blockchainSelection,
) => ({
  crypto: cryptoSelection?.id,
  blockchain: blockchainSelection?.id,
});

export const fetchRampAssets = async (provider, side) => {
  const query = `provider=${encodeURIComponent(provider)}&side=${encodeURIComponent(
    normalizeSide(side),
  )}`;
  const result = await proxyRequest(
    `/v1/on-off-ramp/assets?${query}`,
    PGET,
  );
  return unwrapProxyResult(result, (response) =>
    Array.isArray(response?.groups),
  );
};

export const fetchRampQuote = async (provider, side, payload) => {
  const result = await proxyRequest('/v1/on-off-ramp/quote', PPOST, {
    ...payload,
    provider,
    side: normalizeSide(side),
  });
  return unwrapProxyResult(
    result,
    (response) =>
      provider === 'moonpay' &&
      response &&
      typeof response === 'object' &&
      Object.prototype.hasOwnProperty.call(response, 'outputAmount'),
  );
};

export const createRampOrder = async (provider, side, payload) => {
  const result = await proxyRequest('/v1/on-off-ramp/order', PPOST, {
    ...payload,
    provider,
    side: normalizeSide(side),
  });
  return unwrapProxyResult(result);
};

export const createRampLink = async (provider, side, payload) => {
  const result = await proxyRequest('/v1/on-off-ramp/link', PPOST, {
    ...payload,
    provider,
    side: normalizeSide(side),
  });
  return unwrapProxyResult(
    result,
    (response) => typeof response?.url === 'string' && response.url.length > 0,
  );
};
