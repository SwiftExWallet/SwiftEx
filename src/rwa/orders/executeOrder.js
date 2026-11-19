// Executes an RWA buy/sell with the app's EXISTING guarded 1inch Fusion flow (same calls as
// EthSwap.js): buildFusionOrder -> assertFusionOrder (swapGuard) -> native signTypedData ->
// ensureFusionAllowance (exact amount) -> submitOrder -> ShortTermStorage.syncTx (app history).
// Every stage is persisted (public data only) so the tracker can resume after the app is killed.
// Never logs the typed data, signature or auth headers.
import { NativeModules } from "react-native";
import { PPOST, PGET, proxyRequest } from "../../Dashboard/exchange/crypto-exchange-front-end-main/src/api";
import { assertFusionOrder } from "../../utilities/swapGuard";
import { ensureFusionAllowance } from "../../utilities/FusionAllowance";
import ShortTermStorage from "../../utilities/ShortTermStorage";
import { CHAIN_INFO } from "../config";
import { buildQuoteRequest } from "../api/quote";
import { tokenBalance } from "../api/balances";
import { canStartOrder, expiryFor, quoteIsFresh } from "./orderState";
import { verifyRwaFusionOrder } from "./fusionCheck";
import { loadOrders, upsertOrder, renameOrder } from "./orderStore";

let inFlight = false; // one order at a time in this app session (double-tap guard)

const errText = (e, fallback) => {
  const m = e && (e.message || (typeof e === "string" ? e : ""));
  return m ? String(m).slice(0, 160) : fallback;
};

// params: { wallet, asset, side, payToken, amountUnits, amountText, quote, summary, quotedAt, groupKey }
// onUpdate(record) is called on every stage change. Resolves to the final record of this call
// (stage "submitted" on success; the tracker takes it from there) or { error }.
export const executeOrder = async (params, onUpdate = () => {}) => {
  const { wallet, asset, side, payToken, amountUnits, amountText, quote, summary, quotedAt, groupKey } = params;
  if (inFlight) return { error: "An order is already being sent." };
  if (!quoteIsFresh(quotedAt)) return { error: "This quote has expired. Get a new quote first.", code: "quote-expired" };
  const existing = await loadOrders(wallet);
  const can = canStartOrder(existing);
  if (!can.ok) {
    return {
      error: can.reason === "open" ? "You have an order in progress. Wait until it finishes." : "Please wait a moment before placing another order.",
      code: "duplicate",
    };
  }
  inFlight = true;
  const info = CHAIN_INFO[asset.chain];
  const req = buildQuoteRequest({ side, asset, payToken, amountUnits, wallet });
  const outToken = side === "buy" ? { address: asset.address, decimals: asset.decimals, symbol: asset.symbol } : payToken;
  const inToken = side === "buy" ? payToken : { address: asset.address, decimals: asset.decimals, symbol: asset.symbol };
  const createdAt = Date.now();
  let record = {
    id: `local-${createdAt}`,
    orderHash: null,
    groupKey,
    assetId: asset.id,
    symbol: asset.symbol,
    side,
    chain: asset.chain,
    inToken: { address: inToken.address, decimals: inToken.decimals, symbol: inToken.symbol },
    outToken: { address: outToken.address, decimals: outToken.decimals, symbol: outToken.symbol },
    amountIn: amountText,
    amountInUnits: String(amountUnits),
    expectedOut: summary.toAmount,
    minOut: summary.minReceived,
    quoteId: summary.quoteId || null,
    stage: "preparing",
    createdAt,
    expiresAt: expiryFor(createdAt, summary.auctionSeconds),
    approveTx: null,
    fillTx: null,
    outBalanceBefore: null,
    error: null,
  };
  const step = async (patch) => {
    record = { ...record, ...patch };
    await upsertOrder(wallet, record);
    onUpdate(record);
  };
  const fail = async (message) => {
    // Nothing was submitted: the order can never fill. Funds stay in the wallet.
    await step({ stage: "failed", error: message, doneAt: Date.now() });
    return record;
  };
  try {
    await step({ stage: "preparing" });
    try {
      record.outBalanceBefore = await tokenBalance(asset.chain, wallet, outToken.address);
    } catch (e) {
      record.outBalanceBefore = null; // tracker then relies on the backend status + expiry
    }

    const built = await proxyRequest("/v1/swap/1inch/buildFusionOrder", PPOST, { quote, ...req });
    if (built.err && (built.err.status || built.err.message)) return fail(`Couldn't prepare the order: ${errText(built.err, "server error")}`);
    const typedData = built.res && built.res.typedData;
    if (!typedData || !built.res.orderHash) return fail("Couldn't prepare the order: incomplete answer from the server.");
    let checked;
    try {
      // 1) RWA-only stricter check: order hash, extension bound to the salt, and — when the order
      //    pays 1inch's settlement contract — the decoded fee-taker data (final receiver = wallet,
      //    fees <= 2%, net >= shown minimum, nothing unexpected). Throws (fail closed).
      checked = verifyRwaFusionOrder(typedData, {
        wallet,
        chainId: info.chainId,
        extension: built.res.extension,
        orderHash: built.res.orderHash,
        minTakingAmount: summary.minReceived,
      });
      // 2) Every check of the shared guard still runs. Only its "receiver == maker" rule is
      //    satisfied by step 1 for settlement-receiver orders, so it sees the verified final receiver.
      const forSharedGuard =
        checked.receiverRule === "settlement" ? { ...typedData, message: { ...typedData.message, receiver: checked.finalReceiver } } : typedData;
      assertFusionOrder(forSharedGuard, {
        wallet,
        fromToken: { address: req.tokenIn },
        toToken: { address: req.tokenOut },
        amountWei: String(amountUnits),
        chainId: info.chainId,
        crossChain: false,
        minTakingAmount: summary.minReceived,
      });
    } catch (guard) {
      // Public order fields only (no signature exists yet) — helps the backend team see what differed.
      record.guardInfo = {
        receiver: typedData.message && typedData.message.receiver,
        makerAsset: typedData.message && typedData.message.makerAsset,
        takerAsset: typedData.message && typedData.message.takerAsset,
        verifyingContract: typedData.domain && typedData.domain.verifyingContract,
        hasExtension: !!(built.res.extension && built.res.extension !== "0x"),
      };
      record.guardInfo.reason = errText(guard, "unexpected order");
      return fail("This order didn't pass our safety check, so nothing was signed or sent. Please try again later.");
    }

    await step({ stage: "signing" });
    const { primaryType, types, domain, message } = typedData;
    const signed = await NativeModules.TransactionSigner.signTypedData(
      info.appKey.toLowerCase(),
      wallet,
      JSON.stringify({ primaryType, types, domain, message })
    );
    const signature = signed && signed.signature;
    if (!signature) return fail("Signing was cancelled. Nothing was sent.");

    await step({ stage: "approving" });
    const allow = await ensureFusionAllowance(req.tokenIn, wallet, String(amountUnits), info.appKey, info.chainId);
    if (!allow || allow.status !== true) {
      return fail(`Approval failed: ${errText(allow && allow.error, "not enough gas?")}. The order was not sent.`);
    }
    if (allow.txHash) record.approveTx = allow.txHash;

    await step({ stage: "submitting" });
    const sub = await proxyRequest("/v1/swap/1inch/submitOrder", PPOST, {
      chain: req.chain,
      order: {
        maker: message.maker,
        makerAsset: message.makerAsset,
        takerAsset: message.takerAsset,
        makerTraits: message.makerTraits,
        salt: message.salt,
        makingAmount: message.makingAmount,
        takingAmount: message.takingAmount,
        // The receiver that was signed (wallet, or the verified settlement contract). Sending a
        // different value would change the order hash and invalidate the signature.
        receiver: message.receiver,
      },
      quoteId: summary.quoteId,
      orderHash: built.res.orderHash,
      extension: built.res.extension,
      signature,
    });
    if (sub.err) {
      // Unknown whether the relayer accepted it: keep tracking by hash until expiry (no resend).
      const oldId = record.id;
      record = { ...record, id: built.res.orderHash, orderHash: built.res.orderHash, stage: "submitted", error: `Submit answer: ${errText(sub.err, "error")}` };
      await renameOrder(wallet, oldId, record);
      onUpdate(record);
      return record;
    }
    const oldId = record.id;
    record = { ...record, id: built.res.orderHash, orderHash: built.res.orderHash, stage: "submitted" };
    await renameOrder(wallet, oldId, record);
    onUpdate(record);
    try {
      await ShortTermStorage.syncTx({
        quoteId: summary.quoteId,
        txHash: built.res.orderHash,
        walletAddress: wallet,
        fromAddress: wallet,
        toAddress: wallet,
        provider: "ONEINCH_FUSION",
        fromChain: info.backend,
        fromToken: inToken.symbol,
        toChain: info.backend,
        toToken: outToken.symbol,
        amountIn: amountText,
        amountOut: summary.toAmount,
        txType: "Swap",
        fromTokenMetaData: inToken.address,
      });
    } catch (e) {
      // history entry is optional
    }
    return record;
  } catch (e) {
    return fail(errText(e, "Something went wrong. Nothing was sent."));
  } finally {
    inFlight = false;
  }
};

// One status check for a submitted order (backend orderStatus, same call as Transactions.js).
export const fetchOrderStatus = async (record) => {
  const chain = CHAIN_INFO[record.chain].backend;
  const { res, err } = await proxyRequest(
    `/v1/swap/1inch/orderStatus?chain=${chain}&orderHash=${record.orderHash}&swapProvider=ONEINCH_FUSION`,
    PGET
  );
  if (err && (err.status || err.message)) return { error: err };
  return { res };
};

export const __test = { reset: () => { inFlight = false; } };
