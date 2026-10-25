import {isApprovedRecoveryClassicAsset} from './recoveryAssetConfig';

export function defaultRecoveryAssetKeys(assets) {
  return assets
    .filter(
      asset => asset.type === 'native' || isApprovedRecoveryClassicAsset(asset),
    )
    .map(asset => asset.key);
}

export function toggleRecoveryAssetKey(keys, asset) {
  if (asset.type === 'native') return keys;
  return keys.includes(asset.key)
    ? keys.filter(key => key !== asset.key)
    : [...keys, asset.key];
}
