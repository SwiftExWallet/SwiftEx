// Pure region rules (no React, no storage) — unit tested.
import { REGION_RULES } from "./config";

export const normalizeCountry = (c) => (typeof c === "string" ? c.trim().toUpperCase() : "");

// Is this asset's issuer allowed for this country? Unknown country or unknown rule key => no.
export const isAssetAllowed = (asset, country) => {
  const cc = normalizeCountry(country);
  if (!/^[A-Z]{2}$/.test(cc) || !asset) return false;
  const blocked = REGION_RULES[asset.regions];
  if (!blocked) return false;
  return !blocked.includes(cc);
};

export const visibleAssets = (assets, country) => (assets || []).filter((a) => isAssetAllowed(a, country));
