import { ethers } from 'ethers';
import { decodeFusionExtension } from './fusionExtension';

const lc = (a) => String(a ?? '').toLowerCase();
const fail = (msg) => { throw new Error(`Swap blocked: ${msg}`); };

// 1inch Fusion settlement extension, by chainId. Only chains where it has been seen on a
// real order are listed; add others only after confirming against a live order.
export const FUSION_SETTLEMENT = {
  56: ['0x2ad5004c60e16e54d5007c80ce329adde5b51ef5'],
};

export const MAX_FEE_1E5 = 2000; // 2%

// makerTraits flag bits (limit-order-protocol v4 MakerTraitsLib).
const BIT = (n) => 1n << BigInt(n);
const PRE_INTERACTION_CALL = BIT(252);
const POST_INTERACTION_CALL = BIT(251);
const HAS_EXTENSION = BIT(249);
const USE_PERMIT2 = BIT(248);
const UNWRAP_WETH = BIT(247);
const UINT160_MAX = BIT(160) - 1n;

export const isFusionSettlement = (address, chainId) =>
  (FUSION_SETTLEMENT[Number(chainId)] || []).includes(lc(address));

const toBig = (v, what) => {
  try { return BigInt(String(v)); } catch (e) { return fail(`malformed ${what}`); }
};

/**
 * Throws `Swap blocked: ...` unless the fee-bearing order is safe to sign.
 * Call only when message.receiver is neither the wallet nor zero.
 */
export const assertFusionFeeOrder = (message, extension, { wallet, chainId, minTakingAmount, unwrapNative = false }) => {
  if (!isFusionSettlement(message.receiver, chainId)) fail('order pays someone else');
  if (typeof extension !== 'string' || extension.length <= 2) fail('order is missing its extension');

  const traits = toBig(message.makerTraits, 'makerTraits');
  if (!(traits & HAS_EXTENSION)) fail('order extension is not enabled');
  if (!(traits & POST_INTERACTION_CALL)) fail('order would not forward funds to your wallet');
  if (traits & PRE_INTERACTION_CALL) fail('order has an unexpected pre-interaction');
  if (traits & USE_PERMIT2) fail('order uses an unexpected permit');
  // Unwrap is expected only when the user is buying the native coin.
  if ((traits & UNWRAP_WETH) && !unwrapNative) fail('order has an unexpected unwrap');

  let hash;
  try { hash = BigInt(ethers.utils.keccak256(extension)); } catch (e) { fail('malformed order extension'); }
  if ((toBig(message.salt, 'salt') & UINT160_MAX) !== (hash & UINT160_MAX)) {
    fail('order extension does not match the signed order');
  }

  let x;
  try { x = decodeFusionExtension(extension); } catch (e) { fail('malformed order extension'); }
  const { raw } = x;

  const settlement = lc(message.receiver);
  if (lc(x.amountTarget) !== settlement || lc(x.postTarget) !== settlement) {
    fail('order extension calls an unknown contract');
  }
  if (lc(raw.takingAmountData) !== lc(raw.makingAmountData)) fail('order extension is inconsistent');
  for (const f of ['makerAssetSuffix', 'takerAssetSuffix', 'predicate', 'makerPermit', 'preInteraction', 'customData']) {
    if (raw[f] !== '0x') fail(`order has an unexpected ${f}`);
  }
  if (x.chainedPostInteraction) fail('order has an unexpected extra interaction');
  if (x.flags & ~1) fail('order extension has unknown flags');

  // Final recipient: custom receiver when flagged, otherwise the maker.
  const finalReceiver = x.customReceiver ?? message.maker;
  if (lc(finalReceiver) === lc(ethers.constants.AddressZero) || lc(finalReceiver) !== lc(wallet)) {
    fail('order pays someone else');
  }

  // Fees must agree between the amount getters and the post-interaction, and be capped.
  const af = x.amountFees;
  const pf = x.postFees;
  if (af.integratorFee !== pf.integratorFee || af.integratorShare !== pf.integratorShare
    || af.resolverFee !== pf.resolverFee || af.whitelistDiscountNumerator !== pf.whitelistDiscountNumerator) {
    fail('order extension is inconsistent');
  }
  if (af.integratorShare > 100 || af.whitelistDiscountNumerator > 100 || x.surplus.protocolFeePercent > 100) {
    fail('order fee is invalid');
  }
  if (af.integratorFee + af.resolverFee > MAX_FEE_1E5) fail('order fee is above 2%');
  if (x.amountWhitelist.length !== x.whitelist.entries.length
    || x.amountWhitelist.some((h, i) => h !== x.whitelist.entries[i].addressHalf)) {
    fail('order extension is inconsistent');
  }

  // FeeTaker pays the receiver takingAmount (fees are charged on top), minus the surplus
  // fee on anything above estimatedTakerAmount. A low estimate would let that fee eat
  // into the minimum, so require estimate >= takingAmount when a surplus fee applies.
  if (minTakingAmount == null) fail('missing quoted minimum');
  const takingAmount = toBig(message.takingAmount, 'takingAmount');
  if (takingAmount < toBig(minTakingAmount, 'minimum')) fail('order returns less than the quoted minimum');
  if (x.surplus.protocolFeePercent > 0 && x.surplus.estimatedTakerAmount < takingAmount) {
    fail('order fee could reduce what you receive');
  }
};
