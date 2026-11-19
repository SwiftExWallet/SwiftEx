// RWA quotes through the app's EXISTING backend 1inch Fusion quote endpoint (same call as
// EthSwap.get1InchQoute: proxyRequest + PPOST, the app's own auth headers). Read-only: no order is
// built, signed or submitted here.
import { PPOST, proxyRequest } from "../../Dashboard/exchange/crypto-exchange-front-end-main/src/api";
import { CHAIN_INFO } from "../config";
import { mapQuoteError } from "../utils/quoteErrors";

// side "buy": pay token -> asset; side "sell": asset -> pay token. amountUnits = raw units of the input.
export const buildQuoteRequest = ({ side, asset, payToken, amountUnits, wallet }) => ({
  tokenIn: side === "buy" ? payToken.address : asset.address,
  tokenOut: side === "buy" ? asset.address : payToken.address,
  amount: String(amountUnits),
  walletAddress: wallet,
  chain: CHAIN_INFO[asset.chain].backend,
});

// -> { ok: true, quote, summary } | { ok: false, error: { code, text }, status }  (HTTP status only; raw server text is never kept)
export const getRwaQuote = async (params) => {
  const body = buildQuoteRequest(params);
  const { res, err } = await proxyRequest("/v1/swap/1inch/getSwapQuote", PPOST, body);
  if (err && (err.status || err.message)) {
    return { ok: false, error: mapQuoteError(err), status: err.status };
  }
  const summary = summarizeQuote(res);
  if (!summary) {
    return { ok: false, error: { code: "unsupported", text: "This token isn't available through our swap provider yet." }, status: 200 };
  }
  return { ok: true, quote: res, summary };
};

// Fields used by the app's existing swap confirmation (EthSwap): fromTokenAmount, toTokenAmount,
// presets[recommended_preset].auctionEndAmount (min received) / tokenFee, prices.usd.
export const summarizeQuote = (q) => {
  if (!q || !q.presets || !q.recommended_preset || !q.presets[q.recommended_preset]) return null;
  const p = q.presets[q.recommended_preset];
  return {
    fromAmount: q.fromTokenAmount != null ? String(q.fromTokenAmount) : null,
    toAmount: q.toTokenAmount != null ? String(q.toTokenAmount) : null,
    minReceived: p.auctionEndAmount != null ? String(p.auctionEndAmount) : null,
    tokenFee: p.tokenFee != null ? String(p.tokenFee) : "0",
    fromUsd: q.prices && q.prices.usd ? Number(q.prices.usd.fromToken) : null,
    toUsd: q.prices && q.prices.usd ? Number(q.prices.usd.toToken) : null,
    auctionSeconds: p.auctionDuration != null ? Number(p.auctionDuration) : null,
    quoteId: q.quoteId || null,
  };
};
