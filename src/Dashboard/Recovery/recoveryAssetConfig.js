export const RECOVERY_USDC_CODE = 'USDC';
export const RECOVERY_USDC_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export function isApprovedRecoveryClassicAsset(asset) {
  return (
    asset?.type === 'classic' &&
    asset.code === RECOVERY_USDC_CODE &&
    asset.issuer === RECOVERY_USDC_ISSUER
  );
}
