// RWA-only, stricter check of a backend-built 1inch Fusion order before it is signed.
// It replaces ONLY the "receiver must be the maker" rule of the shared assertFusionOrder for orders
// whose receiver is 1inch's settlement (fee-taker) contract; every other shared check still runs
// (see executeOrder.js). Fail closed: anything unexpected or undecodable throws.
//
// Allow-list source: 1inch/limit-order-settlement@b68b27b537079214ade923ed1fd54cd81cca668d
// README.md "Deployments" + deployments/<chain>/(Simple)Settlement.json — the same address
// 0x2Ad5004c60e16E54d5007C80CE329Adde5B51Ef5 on Ethereum (Settlement) and BNB Chain, Polygon,
// Optimism, Base, Arbitrum, Avalanche (SimpleSettlement). RWA trades only on 1 and 56.
import { ethers } from "ethers";
import {
  TRAITS,
  hasTrait,
  splitExtension,
  decodeAmountData,
  decodePostInteraction,
  extensionHashMatchesSalt,
} from "./fusionExtension";

export const ONEINCH_SETTLEMENT = {
  1: ["0x2ad5004c60e16e54d5007c80ce329adde5b51ef5"],
  56: ["0x2ad5004c60e16e54d5007c80ce329adde5b51ef5"],
};

export const MAX_FEE_1E5 = 2000n; // integrator + resolver fee <= 2% (on-chain fee share is fee/(1e5+fee) <= 1.97%)
export const MAX_SURPLUS_FEE_PCT = 50n; // share of any amount ABOVE the estimate (never below the minimum)
const MAX_EXPIRY_AHEAD_S = 24 * 3600;
const BASE_1E5 = 100000n;

const lc = (a) => String(a == null ? "" : a).toLowerCase();
const ZERO = "0x0000000000000000000000000000000000000000";
const block = (msg) => {
  throw new Error(`Swap blocked: ${msg}`);
};

// EIP-712 hash of the order (= LOP orderHash). ethers' encoder rejects an explicit EIP712Domain type.
export const typedOrderHash = (typedData) => {
  const { EIP712Domain, ...types } = typedData.types || {};
  return ethers.utils._TypedDataEncoder.hash(typedData.domain, types, typedData.message);
};

/**
 * @returns {{ receiverRule: 'maker'|'settlement', finalReceiver: string, feeBps1e5?: string, decoded?: object }}
 */
export const verifyRwaFusionOrder = (typedData, { wallet, chainId, extension, orderHash, minTakingAmount, now = Date.now() }) => {
  if (!typedData || !typedData.message || !typedData.domain || !typedData.types) block("malformed order");
  const m = typedData.message;
  if (Number(typedData.domain.chainId) !== Number(chainId)) block("order is for another chain");
  if (lc(m.maker) !== lc(wallet)) block("order maker is not your wallet");

  // The hash the backend gives us (and that we track/submit) must be the hash of what we sign.
  let hash;
  try {
    hash = typedOrderHash(typedData);
  } catch (e) {
    block("order can't be hashed");
  }
  if (!orderHash || lc(hash) !== lc(orderHash)) block("order hash doesn't match the order");

  const traits = m.makerTraits;
  const withExt = hasTrait(traits, TRAITS.HAS_EXTENSION);
  const ext = extension && extension !== "0x" ? extension : null;
  if (withExt !== Boolean(ext)) block("order extension missing or unexpected");
  if (ext && !extensionHashMatchesSalt(ext, m.salt)) block("extension isn't bound to the signed order");

  const receiver = lc(m.receiver);
  if (!receiver || receiver === ZERO || receiver === lc(wallet)) {
    return { receiverRule: "maker", finalReceiver: lc(wallet) }; // unchanged rule: pays the wallet directly
  }

  // (a) receiver must be 1inch's official settlement / fee-taker contract on this chain
  const allowed = ONEINCH_SETTLEMENT[Number(chainId)] || [];
  if (!allowed.includes(receiver)) block("order pays an unknown contract");
  // (b) extension present and bound to the salt (checked above)
  if (!ext) block("order pays a contract but has no extension");

  // (f) maker traits: only the post-interaction call; no pre-interaction, Permit2, WETH unwrap
  if (!hasTrait(traits, TRAITS.POST_INTERACTION)) block("fee-taker call is not enabled");
  if (hasTrait(traits, TRAITS.PRE_INTERACTION)) block("unexpected pre-interaction");
  if (hasTrait(traits, TRAITS.USE_PERMIT2)) block("unexpected Permit2 use");
  if (hasTrait(traits, TRAITS.UNWRAP_WETH)) block("unexpected unwrap");
  const expiry = Number((BigInt(traits) >> 80n) & ((1n << 40n) - 1n));
  const nowS = Math.floor(now / 1000);
  if (!expiry || expiry > nowS + MAX_EXPIRY_AHEAD_S) block("unexpected order expiry");

  let f;
  let amount;
  let post;
  try {
    f = splitExtension(ext);
    amount = decodeAmountData(f.makingAmountData);
    post = decodePostInteraction(f.postInteraction);
  } catch (e) {
    block(`order extension can't be read (${e.message})`);
  }
  // (f) nothing else in the extension
  for (const k of ["makerAssetSuffix", "takerAssetSuffix", "predicate", "makerPermit", "preInteraction", "customData"]) {
    if (f[k] !== "0x") block(`unexpected extension part: ${k}`);
  }
  if (f.takingAmountData !== f.makingAmountData) block("price data differs between getters");
  if (amount.tail !== "") block("price data calls another contract");
  if (post.tail !== "") block("unexpected extra call after the fill");

  // (c) every call goes to the same allow-listed contract as the receiver
  if (amount.target !== receiver || post.target !== receiver) block("extension calls an unknown contract");

  // (d) final receiver of the bought tokens is the user's wallet
  if (post.flags > 1n) block("unknown fee-taker flags");
  const finalReceiver = post.customReceiver || lc(m.maker);
  if (finalReceiver !== lc(wallet)) block("order pays someone else");

  // fee data must be identical in the price getter and the payout
  for (const k of ["integratorFee", "integratorShare", "resolverFee", "discountNumerator"]) {
    if (amount.fees[k] !== post.fees[k]) block("fee data is inconsistent");
  }
  if (amount.whitelist.length !== post.whitelist.length || amount.whitelist.some((h, i) => h !== post.whitelist[i].half)) {
    block("resolver list is inconsistent");
  }

  // (e) fees capped; user's net >= the minimum shown on the review screen
  const fee = post.fees.integratorFee + post.fees.resolverFee;
  if (fee > MAX_FEE_1E5) block("swap fee is above the 2% limit");
  if (post.fees.integratorShare > 100n || post.fees.discountNumerator > 100n) block("invalid fee data");
  if (post.surplusFee > MAX_SURPLUS_FEE_PCT) block("surplus fee too high");
  const taking = BigInt(m.takingAmount);
  if (post.estimatedTakingAmount < taking) block("estimate below the order minimum");
  // Worst case fill: resolver pays the fee-inclusive minimum, fee is taken out, rest goes to the receiver.
  const gross = (taking * (BASE_1E5 + fee) + BASE_1E5 - 1n) / BASE_1E5;
  const net = gross - (gross * fee) / (BASE_1E5 + fee);
  if (minTakingAmount == null) block("no minimum to check against");
  if (net < BigInt(minTakingAmount) || taking < BigInt(minTakingAmount)) block("order returns less than the minimum shown");

  return {
    receiverRule: "settlement",
    finalReceiver,
    feeBps1e5: String(fee),
    decoded: {
      settlement: receiver,
      integratorFee: String(post.fees.integratorFee),
      resolverFee: String(post.fees.resolverFee),
      surplusFee: String(post.surplusFee),
      protocolFeeRecipient: post.protocolFeeRecipient,
      integratorFeeRecipient: post.integratorFeeRecipient,
      customReceiver: post.customReceiver,
      whitelist: post.whitelist.length,
      expiry,
    },
  };
};
