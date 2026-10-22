export const MINIMUM_SEPOLIA_ETH_FOR_MINT = 0.001;

export function hasMinimumSepoliaEth(portfolio) {
  const nativeEth = Array.isArray(portfolio)
    ? portfolio.find(
        token =>
          String(token?.chain || '').toUpperCase() === 'ETH' &&
          String(token?.contractAddress || '').toLowerCase() === 'native',
      )
    : null;

  return Number(nativeEth?.balance || 0) >= MINIMUM_SEPOLIA_ETH_FOR_MINT;
}
