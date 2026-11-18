// Region rules, trade rules, amount math, error mapping, quote request/summary.
jest.mock("../../Dashboard/exchange/crypto-exchange-front-end-main/src/api", () => ({ PPOST: jest.fn(), proxyRequest: jest.fn() }));

const { isAssetAllowed, visibleAssets, isRwaVisibleFor } = require("../regions");
const { payOptionsFor, tradeChecks } = require("../utils/tradeRules");
const A = require("../utils/amounts");
const { mapQuoteError } = require("../utils/quoteErrors");
const { buildQuoteRequest, summarizeQuote, getRwaQuote } = require("../api/quote");
const api = require("../../Dashboard/exchange/crypto-exchange-front-end-main/src/api");

const ondo = { id: "AAPLon-ETH", symbol: "AAPLon", issuer: "ondo", regions: "ondo", chain: "ETH", address: "0x14c3abf95cb9c93a8b82c1cdcb76d72cb87b2d4c", decimals: 18 };
const xs = { id: "AAPLx-BSC", symbol: "AAPLx", issuer: "xstocks", regions: "xstocks", chain: "BSC", address: "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a", decimals: 18 };
const paxg = { id: "PAXG-ETH", symbol: "PAXG", issuer: "paxos", regions: "paxos", chain: "ETH", address: "0x45804880de22913dafe09f4980848ece6ecbaf78", decimals: 18 };

describe("regions", () => {
  test("unknown / malformed country => hidden (fail closed)", () => {
    expect(isAssetAllowed(ondo, "")).toBe(false);
    expect(isAssetAllowed(ondo, null)).toBe(false);
    expect(isAssetAllowed(ondo, "IND")).toBe(false);
    expect(isRwaVisibleFor([ondo, xs, paxg], "")).toBe(false);
  });
  test("India allowed for all; US blocked for all", () => {
    expect(visibleAssets([ondo, xs, paxg], "in")).toHaveLength(3);
    expect(visibleAssets([ondo, xs, paxg], "US")).toHaveLength(0);
  });
  test("per issuer: UK blocks Ondo + xStocks but not PAXG; Germany (EU off) same; Australia only xStocks", () => {
    expect(visibleAssets([ondo, xs, paxg], "GB").map((a) => a.id)).toEqual(["PAXG-ETH"]);
    expect(visibleAssets([ondo, xs, paxg], "DE").map((a) => a.id)).toEqual(["PAXG-ETH"]);
    expect(visibleAssets([ondo, xs, paxg], "AU").map((a) => a.id)).toEqual(["AAPLon-ETH", "PAXG-ETH"]);
    expect(visibleAssets([ondo, xs, paxg], "SG").map((a) => a.id)).toEqual(["AAPLx-BSC", "PAXG-ETH"]);
    expect(visibleAssets([ondo, xs, paxg], "IR")).toHaveLength(0);
  });
  test("asset with an unknown rule key is never shown", () => {
    expect(isAssetAllowed({ ...ondo, regions: "nope" }, "IN")).toBe(false);
  });
});

describe("trade rules", () => {
  test("Ondo: USDC only; xStocks: USDC + USDT; Stellar: none", () => {
    expect(payOptionsFor(ondo).map((t) => t.symbol)).toEqual(["USDC"]);
    expect(payOptionsFor(xs).map((t) => t.symbol)).toEqual(["USDC", "USDT"]);
    expect(payOptionsFor({ chain: "XLM", issuer: "etherfuse" })).toEqual([]);
    expect(payOptionsFor(xs)[0].decimals).toBe(18); // BSC USDC has 18 decimals
    expect(payOptionsFor(ondo)[0].decimals).toBe(6);
  });
  test("xStocks $20 minimum (buy by amount, sell by price)", () => {
    expect(tradeChecks({ asset: xs, side: "buy", amount: "19.99" }).error).toMatch(/at least \$20/);
    expect(tradeChecks({ asset: xs, side: "buy", amount: "20" }).error).toBeNull();
    expect(tradeChecks({ asset: xs, side: "sell", amount: "0.05", unitPriceUsd: 350 }).error).toMatch(/\$20/);
    expect(tradeChecks({ asset: xs, side: "sell", amount: "0.06", unitPriceUsd: 350 }).error).toBeNull();
    expect(tradeChecks({ asset: xs, side: "sell", amount: "0.01", unitPriceUsd: null }).error).toBeNull(); // unknown yet
    expect(tradeChecks({ asset: ondo, side: "buy", amount: "1" }).error).toBeNull();
  });
});

describe("decimals per token (live-test lessons)", () => {
  const { PAY_TOKENS } = require("../config");
  test("USDC is 18 decimals on BNB Chain but 6 on Ethereum; XAUt 6", () => {
    const bscUsdc = PAY_TOKENS.BSC.find((t) => t.symbol === "USDC");
    const ethUsdc = PAY_TOKENS.ETH.find((t) => t.symbol === "USDC");
    expect(A.toUnits("2.5", bscUsdc.decimals)).toBe("2500000000000000000");
    expect(A.toUnits("2.5", ethUsdc.decimals)).toBe("2500000");
    expect(A.fromUnits("6699", 6)).toBe("0.006699"); // XAUt quote 2026-11-19
  });
  test("xStocks $20 minimum counts stablecoins at face value (20 USDT passes even if USDT = $0.9997)", () => {
    expect(tradeChecks({ asset: xs, side: "buy", amount: "20", unitPriceUsd: 1 }).error).toBeNull();
    expect(tradeChecks({ asset: xs, side: "buy", amount: "19.99", unitPriceUsd: 1 }).error).toMatch(/\$20/);
  });
});

describe("amounts", () => {
  test("input cleaning", () => {
    expect(A.cleanAmountInput("1,5")).toBe("1.5");
    expect(A.cleanAmountInput("1.2.3")).toBe("1.23");
    expect(A.cleanAmountInput(".5")).toBe("0.5");
    expect(A.cleanAmountInput("1.1234567", 6)).toBe("1.123456");
    expect(A.cleanAmountInput("abc")).toBe("");
  });
  test("units both ways, 6 and 18 decimals, no float errors", () => {
    expect(A.toUnits("1.5", 6)).toBe("1500000");
    expect(A.toUnits("0.1", 18)).toBe("100000000000000000");
    expect(A.toUnits("20.000001", 6)).toBe("20000001");
    expect(A.toUnits("0", 6)).toBeNull();
    expect(A.toUnits("", 6)).toBeNull();
    expect(A.fromUnits("1500000", 6)).toBe("1.5");
    expect(A.fromUnits("1000000000000000000", 18)).toBe("1");
    expect(A.fromUnits("2837", 6)).toBe("0.002837");
    expect(A.gteUnits("100", "99")).toBe(true);
    expect(A.gteUnits("99", "100")).toBe(false);
  });
  test("display", () => {
    expect(A.fmtAmount("1234567.123456789", 4)).toBe("1,234,567.1234");
    expect(A.fmtPct(-2.981)).toBe("-2.98%");
    expect(A.fmtPct(0.4764)).toBe("+0.48%");
  });
});

describe("quote error mapping", () => {
  test("451 => region", () => expect(mapQuoteError({ status: 451, message: "x" }).code).toBe("region"));
  test("token not supported / liquidity => unsupported", () => {
    expect(mapQuoteError({ status: 400, message: "insufficient liquidity" }).code).toBe("unsupported");
    expect(mapQuoteError({ status: 400, message: ["Token not supported"] }).code).toBe("unsupported");
  });
  test("market closed / halted", () => expect(mapQuoteError({ status: 400, message: "Market is closed" }).code).toBe("closed"));
  test("auth, network, server, other", () => {
    expect(mapQuoteError({ status: 401, message: "Wallet token not found" }).code).toBe("auth");
    expect(mapQuoteError({ status: 403, message: "Invalid Device" }).code).toBe("device"); // seen on dev-proxy 2026-11-18
    expect(mapQuoteError({ status: 0, message: "Network error" }).code).toBe("network");
    expect(mapQuoteError({ status: 502, message: "bad gateway" }).code).toBe("server");
    expect(mapQuoteError({ status: 400, message: "weird" }).code).toBe("other");
  });
});

describe("quote request + summary", () => {
  const usdcBsc = payOptionsFor(xs)[0];
  test("buy: pay token in, asset out; BSC chain name for the backend", () => {
    expect(buildQuoteRequest({ side: "buy", asset: xs, payToken: usdcBsc, amountUnits: "25000000000000000000", wallet: "0xabc" })).toEqual({
      tokenIn: usdcBsc.address,
      tokenOut: xs.address,
      amount: "25000000000000000000",
      walletAddress: "0xabc",
      chain: "BSC",
    });
  });
  test("sell reverses tokens", () => {
    const r = buildQuoteRequest({ side: "sell", asset: ondo, payToken: payOptionsFor(ondo)[0], amountUnits: "1", wallet: "0xabc" });
    expect(r.tokenIn).toBe(ondo.address);
    expect(r.chain).toBe("ETH");
  });
  test("summary reads the recommended preset", () => {
    const q = { fromTokenAmount: "25", toTokenAmount: "70", recommended_preset: "fast", presets: { fast: { auctionEndAmount: "69", tokenFee: "0", auctionDuration: 180 } }, prices: { usd: { fromToken: "1", toToken: "352" } }, quoteId: "q1" };
    expect(summarizeQuote(q)).toMatchObject({ fromAmount: "25", toAmount: "70", minReceived: "69", fromUsd: 1, toUsd: 352, quoteId: "q1" });
    expect(summarizeQuote({})).toBeNull();
  });
  test("getRwaQuote maps backend errors and never throws", async () => {
    api.proxyRequest.mockResolvedValueOnce({ err: { status: 451, message: "restricted" } });
    const r = await getRwaQuote({ side: "buy", asset: xs, payToken: usdcBsc, amountUnits: "1", wallet: "0xabc" });
    expect(r).toMatchObject({ ok: false, error: { code: "region" }, raw: { status: 451 } });
    expect(api.proxyRequest.mock.calls[0][0]).toBe("/v1/swap/1inch/getSwapQuote");
    api.proxyRequest.mockResolvedValueOnce({ res: { presets: null } });
    const r2 = await getRwaQuote({ side: "buy", asset: xs, payToken: usdcBsc, amountUnits: "1", wallet: "0xabc" });
    expect(r2.ok).toBe(false);
  });
});
