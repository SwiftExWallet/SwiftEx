// RWA Fusion order check: real captured BNB order passes; tampered variants are refused.
const { ethers } = require("ethers");
const fx = require("./fixtures/fusionOrderBsc.json");
const { splitExtension, FIELDS, decodePostInteraction, TRAITS } = require("../orders/fusionExtension");
const { verifyRwaFusionOrder, typedOrderHash } = require("../orders/fusionCheck");

const NOW = fx.capturedAtMs;
const ATTACKER = "0x000000000000000000000000000000000000dead";
const clone = (o) => JSON.parse(JSON.stringify(o));

// Re-encode an extension from its fields (ExtensionLib layout).
const buildExtension = (f) => {
  let end = 0;
  let offsets = 0n;
  let concat = "";
  FIELDS.forEach((k, i) => {
    const h = f[k].slice(2);
    concat += h;
    end += h.length / 2;
    if (i < 8) offsets |= BigInt(end) << BigInt(32 * i);
  });
  return "0x" + offsets.toString(16).padStart(64, "0") + concat;
};

// Bind an extension to the order (salt low 160 bits) and recompute the order hash, like a
// malicious backend would, so only the rule under test can catch it.
const bound = (typedData, extension) => {
  const td = clone(typedData);
  const mask = (1n << 160n) - 1n;
  td.message.salt = ((BigInt(td.message.salt) & ~mask) | (BigInt(ethers.utils.keccak256(extension)) & mask)).toString();
  return { typedData: td, extension, orderHash: typedOrderHash(td) };
};

const opts = (over = {}) => ({ wallet: fx.wallet, chainId: fx.chainId, extension: fx.extension, orderHash: fx.orderHash, minTakingAmount: fx.minReceived, now: NOW, ...over });
const run = (td, over) => () => verifyRwaFusionOrder(td, opts(over));

// Edit the post-interaction (and keep the getters in sync when asked).
const withPost = (edit, alsoAmount) => {
  const f = splitExtension(fx.extension);
  const p = f.postInteraction.slice(2);
  f.postInteraction = "0x" + edit(p);
  if (alsoAmount) {
    f.makingAmountData = "0x" + alsoAmount(f.makingAmountData.slice(2));
    f.takingAmountData = f.makingAmountData;
  }
  return buildExtension(f);
};
// byte positions in the post-interaction (hex chars): target 0..40, flags 40..42, integrator 42..82,
// protocol 82..122, fees start at 122 (no custom receiver).
const setResolverFee = (hex, at, v) => hex.slice(0, at + 6) + v + hex.slice(at + 10);

describe("real captured order (BNB, AAPLx buy)", () => {
  test("re-encoding the decoded extension is lossless (decoder sanity)", () => {
    expect(buildExtension(splitExtension(fx.extension))).toBe(fx.extension.toLowerCase());
  });
  test("passes: settlement receiver, final receiver = wallet, fee 0.3%", () => {
    const r = verifyRwaFusionOrder(fx.typedData, opts());
    expect(r.receiverRule).toBe("settlement");
    expect(r.finalReceiver).toBe(fx.wallet.toLowerCase());
    expect(r.decoded).toMatchObject({ settlement: "0x2ad5004c60e16e54d5007c80ce329adde5b51ef5", integratorFee: "0", resolverFee: "300", surplusFee: "0", customReceiver: null });
    expect(typedOrderHash(fx.typedData)).toBe(fx.orderHash);
  });
  test("receiver == maker keeps today's rule (but extension still has to be bound)", () => {
    const td = clone(fx.typedData);
    td.message.receiver = fx.wallet;
    expect(verifyRwaFusionOrder(td, opts({ orderHash: typedOrderHash(td) })).receiverRule).toBe("maker");
  });
  test("custom receiver equal to the wallet passes", () => {
    const ext = withPost((p) => p.slice(0, 40) + "01" + p.slice(42, 122) + fx.wallet.slice(2) + p.slice(122));
    const b = bound(fx.typedData, ext);
    expect(verifyRwaFusionOrder(b.typedData, opts(b)).finalReceiver).toBe(fx.wallet.toLowerCase());
  });
});

describe("tampered orders are refused", () => {
  test("attacker as final (custom) receiver", () => {
    const ext = withPost((p) => p.slice(0, 40) + "01" + p.slice(42, 122) + ATTACKER.slice(2) + p.slice(122));
    const b = bound(fx.typedData, ext);
    expect(run(b.typedData, b)).toThrow(/pays someone else/);
  });
  test("unknown receiver contract", () => {
    const td = clone(fx.typedData);
    td.message.receiver = ATTACKER;
    expect(run(td, { orderHash: typedOrderHash(td) })).toThrow(/unknown contract/);
  });
  test("settlement contract on a chain RWA doesn't allow", () => {
    const td = clone(fx.typedData);
    td.domain.chainId = 137;
    expect(run(td, { chainId: 137, orderHash: typedOrderHash(td) })).toThrow(/unknown contract/);
  });
  test("extension changed but salt kept (hash not bound)", () => {
    const ext = withPost((p) => p.slice(0, 40) + "01" + p.slice(42, 122) + ATTACKER.slice(2) + p.slice(122));
    expect(run(fx.typedData, { extension: ext })).toThrow(/isn't bound/);
  });
  test("fee above the 2% cap (consistent in getter + payout)", () => {
    const amtFeeAt = 40 + 2 * (3 + 4 + 4 + 3 + 3) + 2 + 2 * 5 * Number("0x" + fx.extension.slice(2 + 64 + 40 + 34, 2 + 64 + 40 + 36));
    const ext = withPost((p) => setResolverFee(p, 122, "07d1"), (a) => setResolverFee(a, amtFeeAt, "07d1"));
    const b = bound(fx.typedData, ext);
    expect(decodePostInteraction(splitExtension(ext).postInteraction).fees.resolverFee).toBe(2001n);
    expect(run(b.typedData, b)).toThrow(/above the 2% limit/);
  });
  test("fee changed only in the payout (inconsistent)", () => {
    const b = bound(fx.typedData, withPost((p) => setResolverFee(p, 122, "0190")));
    expect(run(b.typedData, b)).toThrow(/inconsistent/);
  });
  test("net amount below the minimum shown", () => {
    expect(run(fx.typedData, { minTakingAmount: (BigInt(fx.minReceived) + 1n).toString() })).toThrow(/less than the minimum/);
  });
  test("extra pre-interaction (flag + data)", () => {
    const f = splitExtension(fx.extension);
    f.preInteraction = "0x" + ATTACKER.slice(2) + "deadbeef";
    const b = bound(fx.typedData, buildExtension(f));
    b.typedData.message.makerTraits = (BigInt(b.typedData.message.makerTraits) | (1n << TRAITS.PRE_INTERACTION)).toString();
    b.orderHash = typedOrderHash(b.typedData);
    expect(run(b.typedData, b)).toThrow(/pre-interaction/);
    // data without the flag is refused too
    const c = bound(fx.typedData, buildExtension(f));
    expect(run(c.typedData, c)).toThrow(/unexpected extension part: preInteraction/);
  });
  test("maker permit not created by us", () => {
    const f = splitExtension(fx.extension);
    f.makerPermit = "0x" + fx.tokenIn.slice(2) + "00";
    const b = bound(fx.typedData, buildExtension(f));
    expect(run(b.typedData, b)).toThrow(/makerPermit/);
  });
  test("chained post-interaction call", () => {
    const b = bound(fx.typedData, withPost((p) => p + ATTACKER.slice(2) + "00"));
    expect(run(b.typedData, b)).toThrow(/extra call after the fill/);
  });
  test("post-interaction to another contract", () => {
    const b = bound(fx.typedData, withPost((p) => ATTACKER.slice(2) + p.slice(40)));
    expect(run(b.typedData, b)).toThrow(/unknown contract/);
  });
  test("undecodable extension (truncated payout data)", () => {
    const b = bound(fx.typedData, withPost((p) => p.slice(0, 130)));
    expect(run(b.typedData, b)).toThrow(/can't be read/);
    const c = bound(fx.typedData, "0x1234");
    expect(run(c.typedData, c)).toThrow(/can't be read/);
  });
  test("maker mismatch", () => {
    expect(run(fx.typedData, { wallet: ATTACKER })).toThrow(/maker is not your wallet/);
  });
  test("chain mismatch", () => {
    expect(run(fx.typedData, { chainId: 1 })).toThrow(/another chain/);
  });
  test("order hash from backend doesn't match the signed order", () => {
    expect(run(fx.typedData, { orderHash: "0x" + "11".repeat(32) })).toThrow(/hash doesn't match/);
  });
  test("extension missing while the order says it has one", () => {
    expect(run(fx.typedData, { extension: "0x" })).toThrow(/missing or unexpected/);
  });
});
