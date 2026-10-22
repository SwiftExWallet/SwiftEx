export function resolvePortfolioTokenActive(token, savedToken) {
  if (token?.contractAddress === 'Native') return true;
  if (savedToken) return Boolean(savedToken.active);

  const balanceUsd = Number(token?.balanceUSD || 0);
  if (balanceUsd <= 0) return Boolean(token?.active);
  return balanceUsd >= 0.5;
}
