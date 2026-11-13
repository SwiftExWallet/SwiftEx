const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const getPnlShareValues = (data = {}) => ({
  totalPnl: toFiniteNumber(data.totalPnL),
  totalUnrealized: toFiniteNumber(data.totalUnrealized),
});

export const formatPnlAmount = (value, decimals = 4) => {
  const number = toFiniteNumber(value);
  return `${number >= 0 ? '+$' : '-$'}${Math.abs(number).toFixed(decimals)}`;
};
