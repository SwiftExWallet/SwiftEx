// Perps balance across all collateral assets (Aster totals count only USDT).
import { perpsEquity } from "../utils/accountTotals";

describe("perpsEquity", () => {
  test("USDT only: Aster's own total", () => {
    expect(Number(perpsEquity({ totalMarginBalance: "3.42908812", availableBalance: "3.42840239", totalInitialMargin: "0" }))).toBeCloseTo(3.42908812, 8);
  });
  test("live bug: 5 USDC deposited -> balance includes it (was $3.44)", () => {
    expect(Number(perpsEquity({ totalMarginBalance: "3.43624610", availableBalance: "8.43936158", totalInitialMargin: "0" }))).toBeCloseTo(8.43936158, 8);
  });
  test("with a position open: margin in use is added back", () => {
    expect(Number(perpsEquity({ totalMarginBalance: "3.43083638", availableBalance: "6.43415944", totalInitialMargin: "2.00000000" }))).toBeCloseTo(8.43415944, 8);
  });
  test("missing / bad fields never throw", () => {
    expect(perpsEquity(null)).toBe("0");
    expect(Number(perpsEquity({ totalMarginBalance: "5" }))).toBe(5);
    expect(Number(perpsEquity({ totalMarginBalance: "x", availableBalance: "2" }))).toBe(2);
  });
});
