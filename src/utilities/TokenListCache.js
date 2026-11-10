import AsyncStorage from '@react-native-async-storage/async-storage';

export const TOKEN_LIST_CACHE_TTL_MS = 60 * 60 * 1000;

const CACHE_KEY_PREFIX = 'cacheTokenList:';
const inFlightRequests = new Map();

const getCacheKey = url => `${CACHE_KEY_PREFIX}${url}`;

const isValidTokenList = data =>
  Array.isArray(data) ||
  (data !== null &&
    typeof data === 'object' &&
    (Array.isArray(data.tokens) || Array.isArray(data.assets)));

const readCache = async url => {
  try {
    const storedValue = await AsyncStorage.getItem(getCacheKey(url));
    if (!storedValue) return null;

    const entry = JSON.parse(storedValue);
    if (
      typeof entry?.fetchedAt !== 'number' ||
      !isValidTokenList(entry?.data)
    ) {
      return null;
    }

    return entry;
  } catch {
    return null;
  }
};

const fetchAndCache = url => {
  const existingRequest = inFlightRequests.get(url);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Token list request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!isValidTokenList(data)) {
      throw new Error('Token list response has an invalid shape');
    }

    try {
      await AsyncStorage.setItem(
        getCacheKey(url),
        JSON.stringify({ fetchedAt: Date.now(), data }),
      );
    } catch {
      // Persistence is best-effort; a valid live response remains usable.
    }
    return data;
  })();

  inFlightRequests.set(url, request);
  const clearRequest = () => {
    if (inFlightRequests.get(url) === request) {
      inFlightRequests.delete(url);
    }
  };
  request.then(clearRequest, clearRequest);

  return request;
};

export const getCachedTokenList = async (
  url,
  { forceRefresh = false } = {},
) => {
  const cachedEntry = await readCache(url);
  const isFresh =
    cachedEntry && Date.now() - cachedEntry.fetchedAt < TOKEN_LIST_CACHE_TTL_MS;

  if (!forceRefresh && isFresh) {
    return cachedEntry.data;
  }

  try {
    return await fetchAndCache(url);
  } catch (error) {
    if (cachedEntry) return cachedEntry.data;
    throw error;
  }
};
