// Client-side checks on swap transactions/orders built by the SwiftEx backend.
// Goal: even if the backend (or its responses) is compromised, the app only signs
// something that (a) targets a known contract, (b) moves at most the amount the user
// typed, and (c) pays out to the user's own wallet where that can be checked.
//
// Keep these allowlists in sync with the contracts the backend actually uses.
// A swap that targets anything else is REFUSED (fail closed).
import { ethers } from 'ethers';
import { parseQuantity, assertReasonableFee } from './signingReview';

const lc = (a) => String(a ?? '').toLowerCase();
const ZERO = '0x0000000000000000000000000000000000000000';

// 1inch Limit Order Protocol v4 / Aggregation Router v6 (same address on these EVM chains).
export const ONEINCH_LOP = '0x111111125421ca6dc452d289314280a0f8842a65';
export const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';

// Uniswap routers by chainId. VERIFY against backend /v1/swap output before release.
const UNISWAP_ROUTERS = {
  1: ['0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', '0x66a9893cc07d91d95644aedd05d03f95e1dba8af'],
  10: ['0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad'],
  56: ['0xb971ef87ede563556b2ed4b1c0b0019111dd85d2', '0x4dae2f939acf50408e13d58534ff8c2776d45265'],
  137: ['0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad'],
  8453: ['0x2626664c2603336e57b271c5c0b26f421741e481', '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad'],
  42161: ['0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad'],
  43114: ['0xbb00ff08d01d300023c629e8fffffcb65a5a578ce', '0x4dae2f939acf50408e13d58534ff8c2776d45265'],
};

// Contracts that receive native-coin deposits for 1inch Fusion+ native orders, by chainId.
// EMPTY until the backend team confirms the addresses: native Fusion+ swaps are refused until then.
export const NATIVE_ORDER_CONTRACTS = {};

const routersFor = (chainId) => (UNISWAP_ROUTERS[Number(chainId)] || []);
const trustedSpenders = (chainId) => [...routersFor(chainId), PERMIT2, ONEINCH_LOP];

const APPROVE_IFACE = new ethers.utils.Interface(['function approve(address spender, uint256 amount)']);
const APPROVE_SELECTOR = APPROVE_IFACE.getSighash('approve');

const fail = (msg) => { throw new Error(`Swap blocked: ${msg}`); };

/**
 * Validate the transactions returned by POST /v1/swap before signing.
 * @returns the chainId to sign with (always the token's chain, never the backend's).
 */
export const assertUniswapTxs = (rawTxs, { wallet, fromToken, amountWei, isNative }) => {
  const chainId = Number(fromToken.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) fail('unknown chain');
  if (!Array.isArray(rawTxs) || rawTxs.length === 0 || rawTxs.length > 2) fail('unexpected number of transactions');
  const amount = ethers.BigNumber.from(amountWei);
  const routers = routersFor(chainId);
  if (routers.length === 0) fail(`no trusted router for chain ${chainId}`);

  rawTxs.forEach((tx, i) => {
    const isLast = i === rawTxs.length - 1;
    if (tx.chainId !== undefined && tx.chainId !== null && Number(tx.chainId) !== chainId) fail('wrong chain');
    if (tx.from && lc(tx.from) !== lc(wallet)) fail('wrong sender');
    if (!ethers.utils.isAddress(tx.to)) fail('invalid target');
    const value = parseQuantity(tx.value?.toString?.() ?? tx.value, 'value');
    const data = tx.data || '0x';

    if (!isLast) {
      // Only an exact-or-smaller ERC-20 approval of the input token to a trusted spender.
      if (isNative) fail('unexpected approval for a native-coin swap');
      if (lc(tx.to) !== lc(fromToken.address)) fail('approval targets a different token');
      if (!value.isZero()) fail('approval sends coins');
      if (data.slice(0, 10).toLowerCase() !== APPROVE_SELECTOR) fail('first transaction is not an approval');
      const [spender, approveAmount] = APPROVE_IFACE.decodeFunctionData('approve', data);
      if (!trustedSpenders(chainId).includes(lc(spender))) fail(`untrusted spender ${spender}`);
      if (approveAmount.gt(amount)) fail('approval is larger than the swap amount');
      return;
    }

    // The swap itself.
    if (!routers.includes(lc(tx.to))) fail(`untrusted router ${tx.to}`);
    if (isNative) {
      if (!value.eq(amount)) fail('swap sends a different amount than you entered');
    } else if (!value.isZero()) {
      fail('token swap also sends coins');
    }
  });
  return chainId;
};

/** Reject backend gas settings far above the live network price. */
export const assertSwapFees = async (rawTxs, rpcUrl) => {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const networkGasPrice = await provider.getGasPrice();
  for (const tx of rawTxs) {
    assertReasonableFee({
      gasLimit: parseQuantity(tx.gasLimit?.toString?.() ?? tx.gasLimit ?? 0, 'gasLimit'),
      gasPrice: tx.gasPrice != null ? parseQuantity(tx.gasPrice.toString(), 'gasPrice') : undefined,
      maxFeePerGas: tx.maxFeePerGas != null ? parseQuantity(tx.maxFeePerGas.toString(), 'maxFeePerGas') : undefined,
    }, networkGasPrice);
  }
};

/**
 * Validate a 1inch (Fusion / Fusion+) order before signing it.
 * minTakingAmount: the minimum the user was shown on the confirm screen (same-chain only).
 */
export const assertFusionOrder = (typedData, {
  wallet, fromToken, toToken, amountWei, chainId, crossChain, minTakingAmount, skipContractCheck,
}) => {
  if (!typedData?.message || !typedData?.domain) fail('malformed order');
  const { domain, message: m, primaryType } = typedData;
  if (primaryType !== 'Order') fail(`unexpected order type ${primaryType}`);
  if (!skipContractCheck && lc(domain.verifyingContract) !== ONEINCH_LOP) fail('order is for an unknown contract');
  if (domain.chainId !== undefined && Number(domain.chainId) !== Number(chainId)) fail('order is for another chain');
  if (lc(m.maker) !== lc(wallet)) fail('order maker is not your wallet');
  if (lc(m.makerAsset) !== lc(fromToken.address)) fail('order sells a different token');
  if (!ethers.BigNumber.from(m.makingAmount).eq(ethers.BigNumber.from(amountWei))) {
    fail('order sells a different amount than you entered');
  }
  if (!crossChain) {
    if (lc(m.takerAsset) !== lc(toToken.address)) fail('order buys a different token');
    if (m.receiver && lc(m.receiver) !== ZERO && lc(m.receiver) !== lc(wallet)) fail('order pays someone else');
    if (minTakingAmount != null && ethers.BigNumber.from(m.takingAmount).lt(ethers.BigNumber.from(minTakingAmount))) {
      fail('order returns less than the quoted minimum');
    }
  }
};

/** Validate the deposit tx for a native-coin Fusion+ order. */
export const assertNativeOrderTx = (tx, { chainId, amountWei }) => {
  const allowed = (NATIVE_ORDER_CONTRACTS[Number(chainId)] || []).map(lc);
  if (!tx || !ethers.utils.isAddress(tx.to)) fail('invalid target');
  if (!allowed.includes(lc(tx.to))) fail(`untrusted contract ${tx.to}`);
  if (!parseQuantity(String(tx.value ?? '0'), 'value').eq(ethers.BigNumber.from(amountWei))) {
    fail('deposit is a different amount than you entered');
  }
};
