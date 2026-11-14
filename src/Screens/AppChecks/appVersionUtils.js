import { STORE_URLS } from "../../Dashboard/constants";

export const parseVersion = (version) => {
  if (typeof version !== "string" || !/^\d+(?:\.\d+)*$/.test(version.trim())) {
    return null;
  }

  return version.trim().split(".").map(Number);
};

export const isUpdateRequired = (currentVersion, latestVersion) => {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);

  if (!current || !latest) {
    return false;
  }

  const length = Math.max(current.length, latest.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index] || 0;
    const latestPart = latest[index] || 0;

    if (currentPart !== latestPart) {
      return currentPart < latestPart;
    }
  }

  return false;
};

export const getAppStoreUrl = (platform) => STORE_URLS[platform] || null;
