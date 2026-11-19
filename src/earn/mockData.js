export function makeSeries(n, start, amp, trend, seed = 1) {
  const out = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v += trend + Math.sin((i + seed) * 0.7) * amp * 0.5 + Math.cos(i * seed * 0.33) * amp * 0.3;
    out.push(Number(v.toFixed(4)));
  }
  return out;
}

export const account = {
  name: 'Main Account',
  uid: 'UID 82910443',
  total: 2184.36,
  pnlToday: -46.21,
  pnlPct: -2.07,
  available: 1520.1,
  inOrders: 410.5,
  unrealized: -46.21,
  pnlHistory: makeSeries(48, 2260, 14, -1.6, 5),
};

export const holdings = [
  {symbol: 'BTC', name: 'Bitcoin', qty: 0.0124, value: 834.1, change: -1.84},
  {symbol: 'ETH', name: 'Ethereum', qty: 0.21, value: 612.45, change: -3.12},
  {symbol: 'USDT', name: 'Tether', qty: 520, value: 520, change: 0.01},
];

export const openOrders = [
  {id: 'o1', pair: 'BTC/USDT', side: 'Buy', type: 'Limit', price: 66500, qty: 0.005, filled: 0, time: '16 Nov, 14:20'},
  {id: 'o2', pair: 'ETH/USDT', side: 'Sell', type: 'Limit', price: 3120, qty: 0.08, filled: 40, time: '16 Nov, 11:05'},
];

export const trades = [
  {id: 't1', pair: 'BTC/USDT', side: 'Buy', price: 67250.5, qty: 0.004, fee: 0.27, time: '16 Nov, 13:42', pnl: -3.48},
  {id: 't2', pair: 'ETH/USDT', side: 'Sell', price: 2984.1, qty: 0.1, fee: 0.3, time: '16 Nov, 10:18', pnl: 12.4},
  {id: 't3', pair: 'SOL/USDT', side: 'Buy', price: 142.35, qty: 2, fee: 0.28, time: '15 Nov, 22:51', pnl: 6.1},
  {id: 't4', pair: 'BTC/USDT', side: 'Sell', price: 68020, qty: 0.003, fee: 0.2, time: '15 Nov, 19:07', pnl: 21.86},
  {id: 't5', pair: 'BNB/USDT', side: 'Buy', price: 584.2, qty: 0.5, fee: 0.29, time: '15 Nov, 09:33', pnl: -4.15},
  {id: 't6', pair: 'ETH/USDT', side: 'Buy', price: 3044.8, qty: 0.12, fee: 0.37, time: '14 Nov, 17:26', pnl: -8.92},
  {id: 't7', pair: 'SOL/USDT', side: 'Sell', price: 149.9, qty: 3, fee: 0.45, time: '14 Nov, 12:10', pnl: 18.3},
  {id: 't8', pair: 'BTC/USDT', side: 'Buy', price: 66890, qty: 0.002, fee: 0.13, time: '13 Nov, 21:44', pnl: 7.2},
  {id: 't9', pair: 'ETH/USDT', side: 'Sell', price: 3101.25, qty: 0.05, fee: 0.16, time: '13 Nov, 08:02', pnl: -2.6},
];

export const futuresPositions = [
  {id: 'f1', symbol: 'BTC', pair: 'BTCUSDT', side: 'Long', leverage: 10, size: 0.02, entry: 68120, mark: 67250, pnl: -17.4, pnlPct: -12.77, margin: 136.24, liq: 61850},
  {id: 'f2', symbol: 'ETH', pair: 'ETHUSDT', side: 'Short', leverage: 5, size: 0.4, entry: 3080, mark: 2984, pnl: 38.4, pnlPct: 15.58, margin: 246.4, liq: 3650},
  {id: 'f3', symbol: 'SOL', pair: 'SOLUSDT', side: 'Long', leverage: 3, size: 5, entry: 138.2, mark: 142.35, pnl: 20.75, pnlPct: 9.01, margin: 230.33, liq: 94.1},
];

export const analysis = [
  {label: 'Win rate', value: '58%'},
  {label: 'Total trades', value: '124'},
  {label: 'Avg. profit', value: '+$18.40', tone: 'up'},
  {label: 'Avg. loss', value: '-$12.10', tone: 'down'},
  {label: 'Best trade', value: '+$212.00', tone: 'up'},
  {label: 'Max drawdown', value: '-8.4%', tone: 'down'},
];
