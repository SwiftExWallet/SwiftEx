// Stellar USDY / CETES: open the app's existing Aquarius instant swap (newOffer_modal) with the
// pinned assets preselected. Uses the app's own Stellar token list entries (same shape AMMSwap uses).
import StellarTokens from "../../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/stellar/Tokens.json";
import { STELLAR_USDC_ISSUER } from "../config";

const list = () => (Array.isArray(StellarTokens) ? StellarTokens : StellarTokens.assets || StellarTokens.tokens || []);

export const findStellarToken = (code, issuer) => list().find((t) => t && t.code === code && t.issuer === issuer) || null;

// side "buy": USDC -> asset; "sell": asset -> USDC. Returns navigation params or null if not in the list.
export const stellarSwapParams = (asset, side) => {
  const usdc = findStellarToken("USDC", STELLAR_USDC_ISSUER);
  const tok = findStellarToken(asset.code, asset.stellarIssuer);
  if (!usdc || !tok) return null;
  return side === "buy" ? { fromToken: usdc, toToken: tok } : { fromToken: tok, toToken: usdc };
};
