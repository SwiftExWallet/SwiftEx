// Pure decoder for 1inch Limit Order Protocol v4 order extensions built by Fusion
// (SimpleSettlement / FeeTaker). RWA-only; used by fusionCheck.js before anything is signed.
// Throws on anything it can't parse exactly (callers treat that as "refuse").
//
// Layout sources (read 2026-11-19):
// - ExtensionLib / OffsetsLib: 1inch/limit-order-protocol@50bd1300315606a3d32e9021898374c9d0dc2335
//   contracts/libraries/ExtensionLib.sol, OffsetsLib.sol — 32-byte offsets word, field i ends at
//   bits [32*i, 32*i+32), starts where field i-1 ends; CustomData = everything after field 7.
// - OrderLib.isValidExtension (same commit): low 160 bits of salt == low 160 bits of keccak256(extension).
// - MakerTraitsLib (same commit): flag bits 255..247.
// - FeeTaker._postInteraction + AmountGetterWithFee._parseFeeData (same commit):
//   post-interaction data = flags(1) | integratorFeeRecipient(20) | protocolFeeRecipient(20) |
//   [customReceiver(20) if flags&1] | integratorFee(2,1e5) | integratorShare(1,1e2) | resolverFee(2,1e5) |
//   whitelistDiscountNumerator(1,1e2) | whitelist | ...; final receiver = customReceiver or order.maker.
// - SimpleSettlement (1inch/limit-order-settlement@b68b27b537079214ade923ed1fd54cd81cca668d
//   contracts/SimpleSettlement.sol): auction details in amount getters (gasBump 3 | gasPrice 4 |
//   start 4 | duration 3 | initialRateBump 3 | N 1 | N*(rate 3, delta 2)); post-interaction whitelist =
//   allowedTime 4 | N 1 | N*(addrHalf 10, delay 2); then estimatedTakingAmount 32 | surplusFee 1 (1e2);
//   any remaining tail (>=20 bytes) is a chained post-interaction call.
// - fusion-sdk (1inch/fusion-sdk@7aa97abce607a486615e6971473c58fdbe480687)
//   src/fusion-order/fusion-extension.ts: same encoding; getter whitelist = N 1 | N*(addrHalf 10).
import { ethers } from "ethers";

export const FIELDS = [
  "makerAssetSuffix",
  "takerAssetSuffix",
  "makingAmountData",
  "takingAmountData",
  "predicate",
  "makerPermit",
  "preInteraction",
  "postInteraction",
  "customData",
];

export const TRAITS = {
  NO_PARTIAL_FILLS: 255n,
  ALLOW_MULTIPLE_FILLS: 254n,
  PRE_INTERACTION: 252n,
  POST_INTERACTION: 251n,
  NEED_EPOCH_CHECK: 250n,
  HAS_EXTENSION: 249n,
  USE_PERMIT2: 248n,
  UNWRAP_WETH: 247n,
};

const bad = (msg) => {
  throw new Error(`extension: ${msg}`);
};

const strip = (hex) => {
  if (typeof hex !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(hex)) bad("not hex bytes");
  return hex.slice(2).toLowerCase();
};

export const hasTrait = (makerTraits, bit) => ((BigInt(makerTraits) >> bit) & 1n) === 1n;

// Split an extension into its 9 fields. Strict: offsets must be non-decreasing and in bounds.
export const splitExtension = (extension) => {
  const h = strip(extension);
  if (h.length < 64) bad("shorter than the offsets word");
  const offsets = BigInt("0x" + h.slice(0, 64));
  const concat = h.slice(64);
  const len = concat.length / 2;
  const out = {};
  let begin = 0;
  for (let i = 0; i < 8; i++) {
    const end = Number((offsets >> BigInt(32 * i)) & 0xffffffffn);
    if (end < begin || end > len) bad(`bad offset for ${FIELDS[i]}`);
    out[FIELDS[i]] = "0x" + concat.slice(begin * 2, end * 2);
    begin = end;
  }
  out.customData = "0x" + concat.slice(begin * 2);
  return out;
};

// Sequential reader over hex bytes.
const reader = (hex) => {
  const h = strip(hex);
  let p = 0;
  const take = (n) => {
    if (p + n * 2 > h.length) bad("data ends early");
    const s = h.slice(p, p + n * 2);
    p += n * 2;
    return s;
  };
  return {
    uint: (n) => BigInt("0x" + take(n)),
    address: () => ethers.utils.getAddress("0x" + take(20)).toLowerCase(),
    bytes: (n) => take(n),
    rest: () => {
      const s = h.slice(p);
      p = h.length;
      return s;
    },
    left: () => (h.length - p) / 2,
  };
};

// makingAmountData / takingAmountData for SimpleSettlement.
export const decodeAmountData = (hex) => {
  const r = reader(hex);
  const target = r.address();
  const auction = {
    gasBumpEstimate: r.uint(3),
    gasPriceEstimate: r.uint(4),
    startTime: r.uint(4),
    duration: r.uint(3),
    initialRateBump: r.uint(3),
    points: [],
  };
  const n = Number(r.uint(1));
  for (let i = 0; i < n; i++) auction.points.push({ rate: r.uint(3), delta: r.uint(2) });
  const fees = { integratorFee: r.uint(2), integratorShare: r.uint(1), resolverFee: r.uint(2), discountNumerator: r.uint(1) };
  const wl = Number(r.uint(1));
  const whitelist = [];
  for (let i = 0; i < wl; i++) whitelist.push(r.bytes(10));
  // A non-empty tail would make the getter call ANOTHER contract for the price (AmountGetterBase).
  const tail = r.rest();
  return { target, auction, fees, whitelist, tail };
};

// postInteraction for FeeTaker/SimpleSettlement.
export const decodePostInteraction = (hex) => {
  const r = reader(hex);
  const target = r.address();
  const flags = r.uint(1);
  const integratorFeeRecipient = r.address();
  const protocolFeeRecipient = r.address();
  const customReceiver = (flags & 1n) === 1n ? r.address() : null;
  const fees = { integratorFee: r.uint(2), integratorShare: r.uint(1), resolverFee: r.uint(2), discountNumerator: r.uint(1) };
  const allowedTime = r.uint(4);
  const wl = Number(r.uint(1));
  const whitelist = [];
  for (let i = 0; i < wl; i++) whitelist.push({ half: r.bytes(10), delay: r.uint(2) });
  const estimatedTakingAmount = r.uint(32);
  const surplusFee = r.uint(1);
  const tail = r.rest(); // chained post-interaction call if >= 20 bytes
  return { target, flags, integratorFeeRecipient, protocolFeeRecipient, customReceiver, fees, allowedTime, whitelist, estimatedTakingAmount, surplusFee, tail };
};

export const extensionHashMatchesSalt = (extension, salt) => {
  const mask = (1n << 160n) - 1n;
  return (BigInt(ethers.utils.keccak256(extension)) & mask) === (BigInt(salt) & mask);
};
