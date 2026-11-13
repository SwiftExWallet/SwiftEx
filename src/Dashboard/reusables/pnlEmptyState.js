export const getPnlEmptyDisplay = () => ({
  guidance: 'Change the timeline for more info.',
  hero: {
    totalPnl: '+$0.0000',
    unrealized: '+$0.0000',
    realized: '+$0.0000',
  },
  trade: {
    summary: '0% win rate · 0 trades',
    totalTrades: '0',
    winningTrades: '0',
    losingTrades: '0',
    breakevenTrades: '0',
    winRate: '0%',
  },
  metrics: {
    summary: '$0.00 spent · +$0.00 net flow',
    usdcSpent: '$0.00',
    usdcReceived: '$0.00',
    netUsdcFlow: '+$0.00',
    totalTrades: '0',
    winRate: '0%',
    activeDays: '0',
  },
  diagnostics: {
    summary: '0 raw · 0 collapsed · 0 days',
    rawCount: '0',
    collapsedCount: '0',
    activeDays: '0',
    positions: '0',
  },
});
