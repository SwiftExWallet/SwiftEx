// Decoders used by approval screens so the user sees exactly what will be signed.
// Every function here is pure (no network, no keys) so it can be unit-tested.
import { ethers } from 'ethers';
import { TransactionBuilder, Networks, FeeBumpTransaction } from '@stellar/stellar-sdk/axios';

const BN = ethers.BigNumber;
const UINT160_MAX = BN.from(2).pow(160).sub(1);
const UNLIMITED_THRESHOLD = BN.from(2).pow(128); // anything this large is effectively unlimited

export const shortAddr = (a) =>
  typeof a === 'string' && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a ?? '—');

// ─── Strict quantity parsing ─────────────────────────────────────────────────
/**
 * Parse a JSON-RPC quantity. Accepts only 0x-hex strings, decimal-digit strings,
 * non-negative safe integers, or BigNumbers. Anything else throws, so the value shown
 * on screen and the value signed can never be interpreted differently.
 */
export const parseQuantity = (v, field = 'value') => {
  if (v === undefined || v === null || v === '') return BN.from(0);
  if (BN.isBigNumber(v)) return v;
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error(`Invalid ${field}`);
    return BN.from(v);
  }
  if (typeof v === 'string') {
    if (/^0x[0-9a-fA-F]+$/.test(v)) return BN.from(v);
    if (/^[0-9]+$/.test(v)) return BN.from(v);
  }
  throw new Error(`Invalid ${field}: ${String(v).slice(0, 40)}`);
};

export const isUnlimited = (amount) => {
  try { return BN.from(amount).gte(UNLIMITED_THRESHOLD); } catch (_) { return false; }
};

// ─── EVM transaction (WalletConnect eth_sendTransaction / eth_signTransaction) ─
/**
 * Validate and normalise a dApp transaction BEFORE fees are populated.
 * Returns BigNumbers for value/gas fields; throws on malformed input.
 */
export const normalizeDappTx = (raw, walletAddress) => {
  if (!raw || typeof raw !== 'object') throw new Error('Missing transaction');
  if (raw.from && walletAddress && raw.from.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Transaction "from" does not match the connected wallet');
  }
  if (raw.to !== undefined && raw.to !== null && !ethers.utils.isAddress(raw.to)) {
    throw new Error('Invalid "to" address');
  }
  if (!raw.to) throw new Error('Contract deployment is not supported');
  const data = raw.data ?? raw.input ?? '0x';
  if (typeof data !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(data)) throw new Error('Invalid data');

  const tx = {
    to: ethers.utils.getAddress(raw.to),
    value: parseQuantity(raw.value, 'value'),
    data,
  };
  const gasLimit = raw.gasLimit ?? raw.gas;
  if (gasLimit !== undefined && gasLimit !== null) tx.gasLimit = parseQuantity(gasLimit, 'gas');
  if (raw.gasPrice != null) tx.gasPrice = parseQuantity(raw.gasPrice, 'gasPrice');
  if (raw.maxFeePerGas != null) tx.maxFeePerGas = parseQuantity(raw.maxFeePerGas, 'maxFeePerGas');
  if (raw.maxPriorityFeePerGas != null) {
    tx.maxPriorityFeePerGas = parseQuantity(raw.maxPriorityFeePerGas, 'maxPriorityFeePerGas');
  }
  if (raw.nonce != null) tx.nonce = parseQuantity(raw.nonce, 'nonce').toNumber();
  return tx;
};

/** Max price per gas the signer will actually use (NativeSign signs a legacy tx). */
export const effectiveGasPrice = (tx) => tx.gasPrice ?? tx.maxFeePerGas ?? BN.from(0);

export const maxNetworkFee = (tx) => BN.from(tx.gasLimit ?? 0).mul(effectiveGasPrice(tx));

// Largest multiple of the current network gas price a dApp may request.
export const MAX_GAS_PRICE_MULTIPLIER = 3;
// Hard ceiling on gas units for a single dApp transaction.
export const MAX_GAS_LIMIT = BN.from(5_000_000);

/** Throws if the dApp-supplied fee is far above the network's current price. */
export const assertReasonableFee = (tx, networkGasPrice) => {
  if (BN.from(tx.gasLimit ?? 0).gt(MAX_GAS_LIMIT)) {
    throw new Error(`Gas limit ${tx.gasLimit.toString()} is above the ${MAX_GAS_LIMIT.toString()} cap`);
  }
  if (networkGasPrice && BN.from(networkGasPrice).gt(0)) {
    const cap = BN.from(networkGasPrice).mul(MAX_GAS_PRICE_MULTIPLIER);
    if (effectiveGasPrice(tx).gt(cap)) {
      throw new Error(`Gas price is more than ${MAX_GAS_PRICE_MULTIPLIER}x the current network price`);
    }
  }
};

const ERC20_IFACE = new ethers.utils.Interface([
  'function approve(address spender, uint256 amount)',
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function setApprovalForAll(address operator, bool approved)',
  'function increaseAllowance(address spender, uint256 addedValue)',
]);

/** Decode common token calls in tx.data so the screen can show spender/recipient. */
export const decodeTokenCall = (data) => {
  if (!data || data === '0x') return null;
  try {
    const parsed = ERC20_IFACE.parseTransaction({ data });
    const a = parsed.args;
    switch (parsed.name) {
      case 'approve':
      case 'increaseAllowance':
        return {
          kind: 'approve', spender: a[0], amount: a[1], unlimited: isUnlimited(a[1]),
        };
      case 'transfer': return { kind: 'transfer', to: a[0], amount: a[1] };
      case 'transferFrom': return { kind: 'transferFrom', from: a[0], to: a[1], amount: a[2] };
      case 'setApprovalForAll': return { kind: 'approveAll', spender: a[0], approved: a[1] };
      default: return null;
    }
  } catch (_) {
    return null;
  }
};

// ─── EIP-712 typed data ──────────────────────────────────────────────────────
const toBNSafe = (v) => { try { return BN.from(v); } catch (_) { return null; } };

const fmtDeadline = (v) => {
  const n = toBNSafe(v);
  if (!n) return String(v);
  if (n.gt(BN.from('100000000000'))) return 'Never';
  return new Date(n.toNumber() * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};

const fmtAmount = (v) => {
  const n = toBNSafe(v);
  if (!n) return String(v);
  if (n.gte(UINT160_MAX) || isUnlimited(n)) return 'UNLIMITED';
  return n.toString() + ' (raw units)';
};

/**
 * Parse an eth_signTypedData request into reviewable rows.
 * `wcChainId` is like "eip155:1". Returns { error } if the request must be refused.
 */
export const decodeTypedData = (typedData, wcChainId) => {
  const out = { rows: [], warnings: [], danger: false, error: null };
  if (!typedData || typeof typedData !== 'object' || !typedData.message || !typedData.primaryType) {
    out.error = 'Malformed typed data';
    return out;
  }
  const { domain = {}, message, primaryType } = typedData;

  // Domain chain must match the session chain, otherwise the signature is for another network.
  const requestChain = Number(String(wcChainId ?? '').split(':')[1]);
  if (domain.chainId !== undefined && domain.chainId !== null) {
    const dc = toBNSafe(domain.chainId);
    if (!dc || !Number.isFinite(requestChain) || !dc.eq(requestChain)) {
      out.error = `Signature is for chain ${String(domain.chainId)}, but the request came on ${wcChainId}`;
      return out;
    }
  }

  out.rows.push(['Type', primaryType]);
  if (domain.name) out.rows.push(['App (dApp-supplied)', String(domain.name)]);
  if (domain.verifyingContract) out.rows.push(['Contract', domain.verifyingContract]);

  const addApproval = ({ token, spender, amount, deadline, label }) => {
    out.title = label;
    out.danger = true;
    if (token) out.rows.push(['Token', token]);
    out.rows.push(['Spender', spender]);
    out.rows.push(['Amount', fmtAmount(amount)]);
    if (deadline !== undefined) out.rows.push(['Valid until', fmtDeadline(deadline)]);
    out.warnings.push(
      `This signature lets ${shortAddr(spender)} move your tokens with no further confirmation. ` +
      'Approve only if you started this on a site you trust.'
    );
    if (fmtAmount(amount) === 'UNLIMITED') {
      out.warnings.push('The amount is UNLIMITED: the spender can take your entire balance of this token.');
    }
  };

  const m = message;
  if (primaryType === 'Permit' && m.spender !== undefined) {
    if (m.allowed !== undefined) {
      // DAI-style permit: allowed=true means unlimited
      addApproval({
        token: domain.verifyingContract, spender: m.spender,
        amount: m.allowed ? ethers.constants.MaxUint256 : 0, deadline: m.expiry, label: 'Token Permit',
      });
    } else {
      addApproval({
        token: domain.verifyingContract, spender: m.spender, amount: m.value,
        deadline: m.deadline, label: 'Token Permit',
      });
    }
  } else if (primaryType === 'PermitSingle' && m.details) {
    addApproval({
      token: m.details.token, spender: m.spender, amount: m.details.amount,
      deadline: m.details.expiration, label: 'Permit2 Approval',
    });
  } else if (primaryType === 'PermitBatch' && Array.isArray(m.details)) {
    m.details.forEach((d) => addApproval({
      token: d.token, spender: m.spender, amount: d.amount, deadline: d.expiration, label: 'Permit2 Batch Approval',
    }));
  } else if (/^Permit(Witness)?TransferFrom$/.test(primaryType) && m.permitted) {
    addApproval({
      token: m.permitted.token, spender: m.spender, amount: m.permitted.amount,
      deadline: m.deadline, label: 'Permit2 Transfer',
    });
  } else if (/^Permit(Witness)?BatchTransferFrom$/.test(primaryType) && Array.isArray(m.permitted)) {
    m.permitted.forEach((p) => addApproval({
      token: p.token, spender: m.spender, amount: p.amount, deadline: m.deadline, label: 'Permit2 Batch Transfer',
    }));
  } else if (primaryType === 'Order' && m.makerAsset) {
    out.title = 'Limit Order';
    out.danger = true;
    out.rows.push(['You give', `${m.makingAmount} of ${m.makerAsset}`]);
    out.rows.push(['You receive', `${m.takingAmount} of ${m.takerAsset}`]);
    if (m.receiver) out.rows.push(['Receiver', m.receiver]);
    out.warnings.push('Signing creates an order that anyone can fill. Check both amounts carefully.');
  } else if (primaryType === 'OrderComponents' && Array.isArray(m.offer)) {
    out.title = 'Marketplace Order';
    out.danger = true;
    out.warnings.push('This is a marketplace listing that gives away the assets listed under "offer".');
  } else {
    out.title = 'Sign Typed Data';
    out.warnings.push('Read the full message below. Signatures can authorise transfers or approvals.');
  }

  try { out.messageJson = JSON.stringify(m, null, 2); } catch (_) { out.messageJson = '[unreadable]'; }
  return out;
};

// ─── Stellar transactions ────────────────────────────────────────────────────
export const stellarPassphrase = (network) => {
  if (network === 'public') return Networks.PUBLIC;
  if (network === 'testnet') return Networks.TESTNET;
  throw new Error(`Unsupported Stellar network: ${network}`);
};

/** Map a WalletConnect chain id to the Stellar network name, or throw. */
export const stellarNetworkFromChainId = (wcChainId) => {
  if (wcChainId === 'stellar:pubnet') return 'public';
  if (wcChainId === 'stellar:testnet') return 'testnet';
  throw new Error(`Unsupported Stellar chain: ${wcChainId}`);
};

const fmtAsset = (a) => {
  if (!a) return '?';
  if (typeof a.isNative === 'function' && a.isNative()) return 'XLM';
  if (a.code) return `${a.code} (${shortAddr(a.issuer)})`;
  if (a.getCode) return `${a.getCode()} (${shortAddr(a.getIssuer?.())})`;
  return 'Liquidity pool share';
};

const DANGEROUS_STELLAR_OPS = new Set([
  'accountMerge', 'setOptions', 'invokeHostFunction', 'revokeSponsorship',
  'clawback', 'clawbackClaimableBalance', 'setTrustLineFlags', 'allowTrust',
]);

const describeStellarOp = (op) => {
  switch (op.type) {
    case 'payment': return `Send ${op.amount} ${fmtAsset(op.asset)} to ${op.destination}`;
    case 'createAccount': return `Create account ${op.destination} with ${op.startingBalance} XLM`;
    case 'pathPaymentStrictSend':
      return `Send ${op.sendAmount} ${fmtAsset(op.sendAsset)}; ${op.destination} receives at least ${op.destMin} ${fmtAsset(op.destAsset)}`;
    case 'pathPaymentStrictReceive':
      return `Send up to ${op.sendMax} ${fmtAsset(op.sendAsset)}; ${op.destination} receives ${op.destAmount} ${fmtAsset(op.destAsset)}`;
    case 'manageSellOffer':
    case 'createPassiveSellOffer':
      return `Sell ${op.amount} ${fmtAsset(op.selling)} for ${fmtAsset(op.buying)} at price ${op.price}` +
        (op.offerId && op.offerId !== '0' ? ` (offer ${op.offerId})` : '');
    case 'manageBuyOffer':
      return `Buy ${op.buyAmount} ${fmtAsset(op.buying)} with ${fmtAsset(op.selling)} at price ${op.price}` +
        (op.offerId && op.offerId !== '0' ? ` (offer ${op.offerId})` : '');
    case 'changeTrust': return `Trust ${fmtAsset(op.line)} (limit ${op.limit})`;
    case 'accountMerge': return `MERGE THIS ACCOUNT into ${op.destination}: sends the entire XLM balance`;
    case 'setOptions': {
      const parts = [];
      if (op.signer) parts.push(`add/change signer ${op.signer.ed25519PublicKey ?? 'key'} weight ${op.signer.weight}`);
      if (op.masterWeight !== undefined) parts.push(`master weight ${op.masterWeight}`);
      if (op.lowThreshold !== undefined || op.medThreshold !== undefined || op.highThreshold !== undefined) {
        parts.push('change thresholds');
      }
      if (op.inflationDest) parts.push(`inflation dest ${op.inflationDest}`);
      if (op.homeDomain !== undefined) parts.push(`home domain ${op.homeDomain}`);
      return `Change account settings: ${parts.join(', ') || 'flags'}`;
    }
    case 'invokeHostFunction': return 'Smart contract call (cannot be fully decoded)';
    case 'beginSponsoringFutureReserves': return `Sponsor reserves for ${op.sponsoredId}`;
    case 'endSponsoringFutureReserves': return 'End reserve sponsorship';
    case 'manageData': return `Set data entry "${op.name}"`;
    case 'bumpSequence': return `Bump sequence to ${op.bumpTo}`;
    case 'createClaimableBalance': return `Lock ${op.amount} ${fmtAsset(op.asset)} in a claimable balance`;
    case 'claimClaimableBalance': return 'Claim a claimable balance';
    default: return op.type;
  }
};

/**
 * Decode a Stellar envelope for display. Throws if it can't be parsed for `network`.
 * `accountId` is the wallet's own G... key.
 */
export const decodeStellarTx = (xdr, network, accountId) => {
  let tx = TransactionBuilder.fromXdr(xdr, stellarPassphrase(network));
  let feeBump = null;
  if (tx instanceof FeeBumpTransaction) {
    feeBump = { feeSource: tx.feeSource, fee: tx.fee };
    tx = tx.innerTransaction;
  }
  const operations = tx.operations.map((op) => {
    const source = op.source ?? tx.source;
    return {
      type: op.type,
      source,
      fromYou: source === accountId,
      text: describeStellarOp(op),
      dangerous: DANGEROUS_STELLAR_OPS.has(op.type),
    };
  });
  return {
    network,
    source: tx.source,
    fee: tx.fee,
    memo: tx.memo?.value ? String(tx.memo.value) : null,
    feeBump,
    operations,
    danger: operations.some((o) => o.dangerous),
  };
};
