const HEX_RE = /^0x([0-9a-fA-F]{2})*$/;

export const EXTENSION_FIELDS = [
  'makerAssetSuffix',
  'takerAssetSuffix',
  'makingAmountData',
  'takingAmountData',
  'predicate',
  'makerPermit',
  'preInteraction',
  'postInteraction',
];

const bad = (msg) => { throw new Error(`invalid order extension: ${msg}`); };

/** Sequential reader over a 0x hex string; every read is bounds-checked. */
class Reader {
  constructor(hex, what) {
    if (typeof hex !== 'string' || !HEX_RE.test(hex)) bad(`${what} is not hex`);
    this.h = hex.slice(2).toLowerCase();
    this.p = 0;
    this.what = what;
  }
  bytes(n) {
    const end = this.p + n * 2;
    if (end > this.h.length) bad(`${this.what} is too short`);
    const out = this.h.slice(this.p, end);
    this.p = end;
    return out;
  }
  uint(n) { return n === 0 ? 0n : BigInt(`0x${this.bytes(n)}`); }
  num(n) { return Number(this.uint(n)); }
  address() { return `0x${this.bytes(20)}`; }
  get remaining() { return (this.h.length - this.p) / 2; }
  rest() { const r = `0x${this.h.slice(this.p)}`; this.p = this.h.length; return r; }
}

/** Split a raw LOP v4 extension into its 8 fields + customData. */
export const decodeExtension = (hex) => {
  const r = new Reader(hex, 'extension');
  if (r.remaining < 32) bad('missing offsets header');
  let offsets = r.uint(32);
  const bodyLen = r.remaining;
  const out = {};
  let consumed = 0;
  for (const field of EXTENSION_FIELDS) {
    const end = Number(offsets & 0xffffffffn);
    if (end < consumed || end > bodyLen) bad('field offsets are out of range');
    out[field] = `0x${r.bytes(end - consumed)}`;
    consumed = end;
    offsets >>= 32n;
  }
  out.customData = r.rest();
  return out;
};

const readFees = (r) => ({
  integratorFee: r.num(2), // 1e5 base
  integratorShare: r.num(1), // 1e2 base
  resolverFee: r.num(2), // 1e5 base
  whitelistDiscountNumerator: r.num(1), // 1e2 base; 100 = no discount
});

/**
 * Decode the Fusion fee extension. Returns the parsed parts; throws on any
 * structural problem. Policy (allow-lists, limits) lives in fusionCheck.js.
 */
export const decodeFusionExtension = (hex) => {
  const ext = decodeExtension(hex);

  // makingAmountData / takingAmountData: settlement(20) | auction | fees | whitelist halves
  const a = new Reader(ext.makingAmountData, 'amount data');
  const amountTarget = a.address();
  const auction = {
    gasBumpEstimate: a.num(3),
    gasPriceEstimate: a.num(4),
    startTime: a.num(4),
    duration: a.num(3),
    initialRateBump: a.num(3),
    points: [],
  };
  const pointCount = a.num(1);
  for (let i = 0; i < pointCount; i++) auction.points.push({ coefficient: a.num(3), delay: a.num(2) });
  const amountFees = readFees(a);
  const halvesCount = a.num(1);
  const amountWhitelist = [];
  for (let i = 0; i < halvesCount; i++) amountWhitelist.push(a.bytes(10));
  if (a.remaining !== 0) bad('unexpected bytes after amount data');

  // postInteraction: settlement(20) | flags(1) | integratorFeeRecipient(20) | protocolFeeRecipient(20)
  //   | [customReceiver(20)] | fees | whitelist | surplus | [chained interaction]
  const p = new Reader(ext.postInteraction, 'post-interaction');
  const postTarget = p.address();
  const flags = p.num(1);
  const integratorFeeRecipient = p.address();
  const protocolFeeRecipient = p.address();
  const customReceiver = (flags & 1) ? p.address() : null;
  const postFees = readFees(p);
  const whitelist = { startTime: p.num(4), entries: [] };
  const wlCount = p.num(1);
  for (let i = 0; i < wlCount; i++) whitelist.entries.push({ addressHalf: p.bytes(10), delay: p.num(2) });
  const surplus = { estimatedTakerAmount: p.uint(32), protocolFeePercent: p.num(1) };
  const chainedPostInteraction = p.remaining > 0 ? p.rest() : null;

  return {
    raw: ext,
    amountTarget,
    auction,
    amountFees,
    amountWhitelist,
    postTarget,
    flags,
    integratorFeeRecipient,
    protocolFeeRecipient,
    customReceiver,
    postFees,
    whitelist,
    surplus,
    chainedPostInteraction,
  };
};
