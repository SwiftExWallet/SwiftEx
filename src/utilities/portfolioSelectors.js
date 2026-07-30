export const PORTFOLIO_CHAIN_TO_CHAINS_KEY = {
  ETH: 'ETH',
  BSC: 'BSC',
  BNB: 'BSC',
  POL: 'POL',
  ARB: 'ARB',
  BASE: 'BASE',
  AVAX: 'AVAX',
  OPT: 'OPT',
  Stellar: 'STR',
};


export const getRankedPortfolioTokens = (state, isEligible = null) => {
  const tokens = Array.isArray(state?.activeWalletPortFolio) ? state.activeWalletPortFolio : [];

  return tokens
    .filter((t) => {
      if (!t) return false;
      if (isEligible) {
        const chainKey = PORTFOLIO_CHAIN_TO_CHAINS_KEY[t.chain];
        if (!chainKey || !isEligible(chainKey)) return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => (b.balanceUSD || 0) - (a.balanceUSD || 0));
};

export const getHighestBalanceToken = (state, isEligible = null) => {
  const ranked = getRankedPortfolioTokens(state, isEligible);
  return ranked.length ? ranked[0] : null;
};

export const getHighestNativeBalanceToken = (state, isEligible = null) => {
  const tokens = Array.isArray(state?.activeWalletPortFolio) ? state.activeWalletPortFolio : [];

  const nativeTokens = tokens.filter((t) => {
    if (!t || t.contractAddress !== 'Native') return false;
    if (isEligible) {
      const chainKey = PORTFOLIO_CHAIN_TO_CHAINS_KEY[t.chain];
      if (!chainKey || !isEligible(chainKey)) return false;
    }
    return true;
  });

  if (!nativeTokens.length) return null;

  return nativeTokens.reduce((max, t) =>
    (t.balanceUSD || 0) > (max.balanceUSD || 0) ? t : max
    , nativeTokens[0]);
};

export const getBestAssetForChain = (state, portfolioChainName, chainConfig) => {
  const tokens = Array.isArray(state?.activeWalletPortFolio) ? state.activeWalletPortFolio : [];

  const chainTokens = tokens
    .filter((t) => t && t.chain === portfolioChainName)
    .slice()
    .sort((a, b) => (b.balanceUSD || 0) - (a.balanceUSD || 0));

  for (const t of chainTokens) {
    if (t.contractAddress === 'Native') continue;
    const matched = chainConfig.bridgeSupportTokens?.find(
      (bt) => bt.address?.toLowerCase() === t.contractAddress?.toLowerCase()
    );
    if (matched) return matched;
  }

  if (chainConfig.bridgeSupportTokens?.length) {
    return chainConfig.bridgeSupportTokens[0];
  }

  return null;
};