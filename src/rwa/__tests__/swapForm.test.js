// Simple swap screen helpers: USD <-> token amounts, automatic route, rate, inline errors, closed text.
const F = require("../utils/swapForm");

const BSC = [{ symbol: "USDC", decimals: 18 }, { symbol: "USDT", decimals: 18 }];
const ETH = [{ symbol: "USDC", decimals: 6 }, { symbol: "USDT", decimals: 6 }];
const pay = { BSC, ETH };

describe("amounts", () => {
  test("buy: USD = stablecoin at face value", () => {
    expect(F.usdToSpend({ side: "buy", usd: "20", decimals: 18 })).toBe("20");
    expect(F.usdToSpend({ side: "buy", usd: "20.5", decimals: 6 })).toBe("20.5");
    expect(F.usdToSpend({ side: "buy", usd: "", decimals: 6 })).toBe("");
    expect(F.usdToSpend({ side: "buy", usd: "0", decimals: 6 })).toBe("");
  });
  test("sell: tokens = USD / price, floored (never more than typed)", () => {
    expect(F.usdToSpend({ side: "sell", usd: "20", price: 355.64, decimals: 18 })).toBe("0.05623664");
    expect(Number(F.usdToSpend({ side: "sell", usd: "20", price: 355.64, decimals: 18 })) * 355.64).toBeLessThanOrEqual(20);
    expect(F.usdToSpend({ side: "sell", usd: "20", price: null, decimals: 18 })).toBe("");
  });
  test("spend -> USD", () => {
    expect(F.spendToUsd({ side: "buy", amount: "21.5" })).toBe(21.5);
    expect(F.spendToUsd({ side: "sell", amount: "0.1", price: 300 })).toBeCloseTo(30);
    expect(F.spendToUsd({ side: "sell", amount: "0.1", price: null })).toBeNull();
  });
});

describe("automatic route", () => {
  test("buy: the stablecoin + chain with the most balance", () => {
    expect(F.pickRoute({ side: "buy", chains: ["ETH", "BSC"], payOptionsByChain: pay, balances: { BSC: { USDC: 20.4, USDT: 0.08 }, ETH: { USDC: 0, USDT: 0 } } })).toEqual({ chain: "BSC", paySym: "USDC" });
    expect(F.pickRoute({ side: "buy", chains: ["ETH", "BSC"], payOptionsByChain: pay, balances: { BSC: { USDT: 5 }, ETH: { USDT: 50 } } })).toEqual({ chain: "ETH", paySym: "USDT" });
  });
  test("nothing held: BNB Chain preferred; Ondo -> USDC only", () => {
    expect(F.pickRoute({ side: "buy", chains: ["ETH", "BSC"], payOptionsByChain: pay, balances: {} })).toEqual({ chain: "BSC", paySym: "USDC" });
    expect(F.pickRoute({ side: "buy", chains: ["ETH"], payOptionsByChain: { ETH: [ETH[0]] }, balances: {} })).toEqual({ chain: "ETH", paySym: "USDC" });
  });
  test("sell: the chain that holds the asset", () => {
    expect(F.pickRoute({ side: "sell", chains: ["ETH", "BSC"], payOptionsByChain: pay, balances: { ETH: { asset: 0.5 }, BSC: { asset: 0.1 } } })).toEqual({ chain: "ETH", paySym: "USDC" });
  });
});

describe("display", () => {
  test("rate line", () => {
    expect(F.rateText({ side: "buy", symbol: "AAPLx", amountIn: "20", amountOut: "0.055868" })).toBe("1 AAPLx = $357.99");
    expect(F.rateText({ side: "sell", symbol: "AAPLx", amountIn: "0.05987", amountOut: "21.06692" })).toBe("1 AAPLx = $351.88");
    expect(F.rateText({ side: "buy", symbol: "X", amountIn: "0", amountOut: "1" })).toBeNull();
  });
  test("inline error order: rule, balance, gas", () => {
    expect(F.amountError({ ruleError: "xStocks orders must be at least $20.", insufficient: true, spendSymbol: "USDT" })).toMatch(/\$20/);
    expect(F.amountError({ insufficient: true, spendSymbol: "USDT", lowGas: true, nativeSymbol: "BNB" })).toBe("Not enough USDT");
    expect(F.amountError({ lowGas: true, nativeSymbol: "BNB" })).toBe("Not enough BNB for the network fee");
    expect(F.amountError({})).toBeNull();
  });
  test("holdings: no exponent notation, dust hidden (live bug: 7.3e-7 AAPLon showed as 7.32)", () => {
    expect(F.fmtHolding(7.320174e-7)).toBe("<0.000001");
    expect(F.fmtHolding(0.0598705)).toBe("0.05987");
    expect(F.fmtHolding(1234.5)).toBe("1,234.5");
    expect(F.isDust(7.32e-7, 355)).toBe(true); // $0.0003
    expect(F.isDust(0.0598, 355)).toBe(false);
    expect(F.isDust(0.5, null)).toBe(false);
    expect(F.isDust(0, 355)).toBe(true);
  });
  test("closed text only when not open", () => {
    const sat = new Date("2026-11-21T15:00:00Z"); // Saturday
    expect(F.closedText({ open: true }, sat)).toBeNull();
    expect(F.closedText({ open: false, status: "halted" }, sat)).toBe("Paused");
    expect(F.closedText({ open: false, status: "closed" }, sat, true)).toBe("Opens Sun 8:05 PM ET"); // Ondo 24/5: overnight session reopens Sunday evening
    expect(F.closedText({ open: false, status: "closed" }, sat, false)).toBe("Closed");
    expect(F.closedText({ open: false, status: "closed", nextChangeAt: "2026-11-23T14:30:00Z" }, sat, false)).toBe("Opens Mon 9:30 AM ET");
  });
});
