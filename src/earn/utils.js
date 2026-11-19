export function fmt(n, d = 2) {
  const num = Number(n) || 0;
  const neg = num < 0;
  const [i, f] = Math.abs(num).toFixed(d).split('.');
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + int + (f ? '.' + f : '');
}

export const usd = (n, d = 2) => (n < 0 ? '-$' : '$') + fmt(Math.abs(n), d);

export const signed = (n, d = 2) => (n >= 0 ? '+' : '-') + fmt(Math.abs(n), d);

export const signedUsd = (n, d = 2) => (n >= 0 ? '+' : '-') + '$' + fmt(Math.abs(n), d);

export const pct = (n, d = 2) => (n >= 0 ? '+' : '-') + Math.abs(n).toFixed(d) + '%';

export function compactUsd(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return usd(n);
}

export const floor2 = n => Math.floor((Number(n) || 0) * 100) / 100;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function today() {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function nowTime(offsetSec = 0) {
  const d = new Date(Date.now() + offsetSec * 1000);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export const shortHash = h => (h && h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);

export function randomHash() {
  const c = '0123456789abcdef';
  let s = '0x';
  for (let i = 0; i < 64; i++) s += c[Math.floor(Math.random() * 16)];
  return s;
}

export function hexToRgba(hex, alpha) {
  if (!hex || hex[0] !== '#') return hex;
  const h = hex.length === 4 ? hex.replace(/./g, (x, i) => (i ? x + x : x)) : hex;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
