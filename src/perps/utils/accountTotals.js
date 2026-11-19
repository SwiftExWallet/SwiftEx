// Perps balance shown on the Perps tab (pure, unit tested).
//
// Aster's account totals (totalMarginBalance / totalWalletBalance) count only USDT, but
// availableBalance counts every collateral asset (USDC, USD1, BNB …) at its USD margin value,
// minus the margin in use. Seen live 2026-11-19 after a 5 USDC deposit:
//   totalMarginBalance 3.436, availableBalance 8.439, totalInitialMargin 0
//   (with a $2-margin position open: availableBalance 6.434, totalInitialMargin 2.0)
// So the balance across all assets = availableBalance + totalInitialMargin. Never show less than
// Aster's own USDT total (availableBalance can be a little lower because of fee/haircut buffers).
import { add, gt, isValid } from "./decimal";

const num = (v) => (isValid(v) ? String(v) : "0");

export const perpsEquity = (d) => {
  if (!d) return "0";
  const usdtOnly = num(d.totalMarginBalance);
  const allAssets = add(num(d.availableBalance), num(d.totalInitialMargin));
  return gt(allAssets, usdtOnly) ? allAssets : usdtOnly;
};
