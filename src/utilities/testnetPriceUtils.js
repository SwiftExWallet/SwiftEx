export function getTestnetStellarPrice({assetType, symbol, xlmUsdPrice}) {
  if (String(symbol).toUpperCase() === 'USDC') return 1;
  if (assetType !== 'native') return 0;
  return Number.isFinite(xlmUsdPrice) && xlmUsdPrice > 0 ? xlmUsdPrice : 0;
}
