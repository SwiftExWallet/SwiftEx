// Deposit (USDT on BSC -> Aster perps) and Withdraw (Aster perps -> same wallet on BSC).
// Never log keys or signatures.
//
// DEPOSIT — official method (Aster docs "aster-deposit-withdrawal.md" / "aster-chain.md" + verified
// AstherusVault source on Sourcify): approve the vault for the exact amount, then
//   depositFor(USDT, user, amount, broker)   broker != 1000 => futures (perp) account
// Vault (BSC, ERC1967Proxy -> AstherusVault): 0x128463A60784c4D3f46c23Af3f65Ed859Ba87974
//
// WITHDRAW — POST /fapi/v3/aster/user-withdraw (agent v3 signature) carrying the MAIN wallet's
// EIP-712 "Action" signature (domain name 'Aster', chainId 56). Receiver is always the user.
import { ethers } from "ethers";
import { CHAINS } from "../../utilities/TokenUtils";
import { fustionEvmTxManager } from "../../utilities/evmTxManager";
import { signAsterWithdrawRequest } from "./asterWithdrawSigner";
import { asterFetch } from "./asterPublic";
import { PERPS_CHAINS, getAssetLists } from "./asterAssets";
import { asterSignedRequest, getServerNowMs, syncServerTime, nextNonceMicros } from "./asterSigned";
import { toTokenUnits, fromTokenUnits, toPlain, fromUnits, toUnits, isPositive } from "../utils/decimal";

export const ASTER_VAULT_BSC = "0x128463A60784c4D3f46c23Af3f65Ed859Ba87974";
export const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
export const USDT_DECIMALS = 18;
const PERP_BROKER = 0; // any value except 1000 credits the futures account (docs)
const BSC_CHAIN_KEY = "BNB"; // CHAINS key used by the app for BNB Smart Chain
const FALLBACK_DEPOSIT_GAS = ethers.BigNumber.from(180000); // used when depositFor can't be simulated yet
const GAS_BUFFER_PCT = 125;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const VAULT_ABI = [
  "function depositFor(address currency, address forAddress, uint256 amount, uint256 broker) payable",
];
const erc20 = new ethers.utils.Interface(ERC20_ABI);
const vault = new ethers.utils.Interface(VAULT_ABI);

const rpcUrls = (chainKey = BSC_CHAIN_KEY) => {
  const c = CHAINS[chainKey] || {};
  return [c.rpcUrl, ...(c.backupRPCUrls || [])].filter(Boolean);
};

// Runs fn(provider) against the chain's RPCs (the app's own list), falling back on errors.
export const withChainProvider = async (chainKey, chainId, fn) => {
  let lastErr;
  for (const url of rpcUrls(chainKey)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn(new ethers.providers.StaticJsonRpcProvider(url, chainId));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("No RPC available");
};
const withProvider = (fn) => withChainProvider(BSC_CHAIN_KEY, 56, fn);

// Wallet balances on BSC: USDT, BNB, and the vault allowance.
export const getDepositWalletState = async (user) =>
  withProvider(async (provider) => {
    const usdt = new ethers.Contract(USDT_BSC, ERC20_ABI, provider);
    const [usdtBal, bnbBal, allowance] = await Promise.all([
      usdt.balanceOf(user),
      provider.getBalance(user),
      usdt.allowance(user, ASTER_VAULT_BSC),
    ]);
    return {
      usdt: fromTokenUnits(usdtBal, USDT_DECIMALS),
      bnb: fromTokenUnits(bnbBal, 18),
      usdtWei: usdtBal,
      bnbWei: bnbBal,
      allowanceWei: allowance,
    };
  });

// Wallet nonces (read-only), used to time "Deposit sent" and to resume after a relaunch.
// chain: { key, chainId } from asterAssets.PERPS_CHAINS (default BSC).
export const getPendingNonce = (user, chain) =>
  withChainProvider(chain ? chain.key : BSC_CHAIN_KEY, chain ? chain.chainId : 56, (p) => p.getTransactionCount(user, "pending"));
export const getLatestNonce = (user, chain) =>
  withChainProvider(chain ? chain.key : BSC_CHAIN_KEY, chain ? chain.chainId : 56, (p) => p.getTransactionCount(user, "latest"));

// ------------------------------------------------- multi-chain / multi-asset deposit
// chain = asterAssets.PERPS_CHAINS entry; asset = { name, contract, decimals, isNative }.

// Native coin balance + each listed token's balance (wei BigNumbers) on one chain.
export const getChainWalletBalances = (chain, user, assets) =>
  withChainProvider(chain.key, chain.chainId, async (provider) => {
    const tokens = assets.filter((a) => !a.isNative);
    const [nativeWei, ...tokenWei] = await Promise.all([
      provider.getBalance(user),
      ...tokens.map((a) => new ethers.Contract(a.contract, ERC20_ABI, provider).balanceOf(user)),
    ]);
    const out = {};
    assets.forEach((a) => {
      const wei = a.isNative ? nativeWei : tokenWei[tokens.indexOf(a)];
      out[a.name] = { wei, value: fromTokenUnits(wei, a.decimals) };
    });
    return { nativeWei, native: fromTokenUnits(nativeWei, 18), assets: out };
  });

// Ethereum USDT reverts approve(x) when the current allowance is non-zero: reset to 0 first.
const needsZeroApproveFirst = (chain, asset, allowance) =>
  chain.chainId === 1 && asset.name === "USDT" && allowance.gt(0);

// Build (do NOT send) a deposit plan for any chain/asset: approve steps (none for native or
// when the allowance already covers it), depositFor calldata + value, gas in the native coin.
export const prepareChainDeposit = async ({ chain, asset, user, amount }) => {
  if (!isPositive(amount)) return { ok: false, error: "Enter an amount" };
  const amountWei = toTokenUnits(amount, asset.decimals);
  const currency = asset.isNative ? NATIVE_TOKEN_ADDRESS : asset.contract;
  const depositData = vault.encodeFunctionData("depositFor", [currency, user, amountWei, PERP_BROKER]);
  const valueWei = asset.isNative ? amountWei : ethers.BigNumber.from(0);

  const est = await withChainProvider(chain.key, chain.chainId, async (provider) => {
    const token = asset.isNative ? null : new ethers.Contract(asset.contract, ERC20_ABI, provider);
    const [gasPrice, nativeWei, tokenWei, allowance] = await Promise.all([
      provider.getGasPrice(),
      provider.getBalance(user),
      token ? token.balanceOf(user) : Promise.resolve(null),
      token ? token.allowance(user, chain.vault) : Promise.resolve(null),
    ]);
    const approves = [];
    if (token && allowance.lt(amountWei)) {
      if (needsZeroApproveFirst(chain, asset, allowance)) {
        approves.push({ to: asset.contract, data: erc20.encodeFunctionData("approve", [chain.vault, 0]), reset: true });
      }
      approves.push({ to: asset.contract, data: erc20.encodeFunctionData("approve", [chain.vault, amountWei]) });
    }
    let approveGas = ethers.BigNumber.from(0);
    for (const a of approves) {
      // eslint-disable-next-line no-await-in-loop
      approveGas = approveGas.add(await provider.estimateGas({ from: user, to: a.to, data: a.data }).catch(() => ethers.BigNumber.from(70000)));
    }
    let depositGas = FALLBACK_DEPOSIT_GAS;
    let depositSimulated = false;
    try {
      depositGas = await provider.estimateGas({ from: user, to: chain.vault, data: depositData, value: valueWei });
      depositSimulated = true;
    } catch (e) {
      // expected before approval; native deposits normally simulate fine
    }
    return { gasPrice, nativeWei, tokenWei, allowance, approves, approveGas, depositGas, depositSimulated };
  });

  // Same margins as the app's tx helper (gas limit +25%, gas price +25%) plus a little extra.
  const gasCostWei = est.approveGas.add(est.depositGas).mul(GAS_BUFFER_PCT).div(100).mul(est.gasPrice.mul(130).div(100));
  const plan = {
    chainId: chain.chainId,
    chainKey: chain.key,
    asset: asset.name,
    contract: asset.isNative ? null : asset.contract,
    decimals: asset.decimals,
    isNative: asset.isNative,
    amount: fromTokenUnits(amountWei, asset.decimals),
    amountWei,
    valueWei,
    needsApprove: est.approves.length > 0,
    approves: est.approves,
    deposit: { to: chain.vault, data: depositData },
    gasCostWei,
    gasCost: fromTokenUnits(gasCostWei, 18),
    gasPriceGwei: ethers.utils.formatUnits(est.gasPrice, "gwei"),
    depositSimulated: est.depositSimulated,
    nativeBalance: fromTokenUnits(est.nativeWei, 18),
    // Max for a native deposit: keep 2x this deposit's gas for the network fee.
    nativeMax: asset.isNative
      ? fromTokenUnits(est.nativeWei.gt(gasCostWei.mul(2)) ? est.nativeWei.sub(gasCostWei.mul(2)) : 0, 18)
      : null,
  };
  const nat = chain.native;
  if (asset.isNative) {
    if (est.nativeWei.lt(amountWei.add(gasCostWei))) {
      return {
        ok: false,
        plan,
        lowGas: est.nativeWei.gte(amountWei),
        error: `Not enough ${nat}: the deposit plus about ${toPlain(plan.gasCost)} ${nat} for the network fee is more than your ${toPlain(
          plan.nativeBalance
        )} ${nat}.`,
      };
    }
  } else {
    if (est.tokenWei.lt(amountWei)) {
      return { ok: false, plan, error: `Not enough ${asset.name}. Your wallet has ${fromTokenUnits(est.tokenWei, asset.decimals)}.` };
    }
    if (est.nativeWei.lt(gasCostWei)) {
      return {
        ok: false,
        plan,
        lowGas: true,
        error: `Not enough ${nat} for the network fee: ${plan.needsApprove ? "approve + deposit need" : "the deposit needs"} about ${toPlain(
          plan.gasCost
        )} ${nat}; you have ${toPlain(plan.nativeBalance)} ${nat}.`,
      };
    }
  }
  return { ok: true, plan, error: null };
};

// Last check right before signing: everything in the plan must belong to the selected chain.
// Returns an error string (abort) or null.
export const verifyDepositPlan = async (user, plan) => {
  const chain = PERPS_CHAINS.find((c) => c.chainId === Number(plan.chainId));
  if (!chain || chain.key !== plan.chainKey) return "Unknown network";
  const appChain = CHAINS[plan.chainKey];
  if (!appChain || Number(appChain.chainId) !== chain.chainId) return "Network settings don't match";
  const same = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
  if (!same(plan.deposit.to, chain.vault)) return "Wrong deposit contract for this network";
  let lists;
  try {
    lists = await getAssetLists();
  } catch (e) {
    return "Couldn't verify the asset list. Check your connection.";
  }
  const listed = (lists.deposit || []).find((a) => a.chainId === chain.chainId && a.name === plan.asset);
  if (!listed || listed.isNative !== !!plan.isNative || Number(listed.decimals) !== Number(plan.decimals)) {
    return "Asset isn't supported on this network";
  }
  if (!plan.isNative && !same(listed.contract, plan.contract)) return "Token contract doesn't match this network";
  let args;
  try {
    args = vault.decodeFunctionData("depositFor", plan.deposit.data);
  } catch (e) {
    return "Invalid deposit data";
  }
  const currency = plan.isNative ? NATIVE_TOKEN_ADDRESS : plan.contract;
  if (!same(args.currency, currency) || !same(args.forAddress, user)) return "Deposit data doesn't match";
  if (!args.amount.eq(plan.amountWei) || !args.broker.eq(PERP_BROKER)) return "Deposit amount doesn't match";
  if (!ethers.BigNumber.from(plan.valueWei).eq(plan.isNative ? plan.amountWei : 0)) return "Deposit value doesn't match";
  for (const a of plan.approves || []) {
    if (plan.isNative || !same(a.to, plan.contract)) return "Approval is for the wrong token";
    try {
      const ap = erc20.decodeFunctionData("approve", a.data);
      if (!same(ap.spender, chain.vault)) return "Approval is for the wrong contract";
      if (!a.reset && !ap.amount.eq(plan.amountWei)) return "Approval amount doesn't match";
    } catch (e) {
      return "Invalid approval data";
    }
  }
  return null;
};

// Send a prepared plan through the app's existing EVM signer/broadcaster (fustionEvmTxManager).
// onStep('approving' | 'depositing' | 'waiting'). Never throws.
export const executeChainDeposit = async (user, plan, onStep) => {
  const guard = await verifyDepositPlan(user, plan).catch(() => "Couldn't verify the deposit");
  if (guard) return { ok: false, step: plan.needsApprove ? "approve" : "deposit", error: `Stopped before sending: ${guard}` };
  let approveHash = null;
  for (const a of plan.approves || []) {
    if (onStep) onStep("approving");
    // eslint-disable-next-line no-await-in-loop
    const r = await fustionEvmTxManager(plan.chainKey, user, "0", a.to, a.data);
    approveHash = (r.txResponse && r.txResponse.hash) || approveHash;
    if (!r.status) return { ok: false, step: "approve", error: r.error || "Approval failed", approveHash };
  }
  if (onStep) await onStep("depositing");
  const d = await fustionEvmTxManager(plan.chainKey, user, plan.valueWei.toString(), plan.deposit.to, plan.deposit.data);
  const txHash = d.txResponse && d.txResponse.hash;
  if (!d.status) return { ok: false, step: "deposit", error: d.error || "Deposit failed", approveHash, txHash };
  if (onStep) onStep("waiting");
  return { ok: true, approveHash, txHash };
};

export const NATIVE_TOKEN_ADDRESS = "0xfdAE1bA7C826aBDc4c99903c8056f82a1A04a615";

// Public: deposit asset config (min deposit) for USDT on BSC perps.
export const fetchDepositAsset = async () => {
  const { data, error } = await asterFetch(
    "https://www.asterdex.com/bapi/futures/v1/public/future/aster/deposit/assets?chainIds=56&networks=EVM&accountType=perp",
    { timeoutMs: 15000 }
  );
  if (error) return { data: null, error };
  const list = Array.isArray(data?.data) ? data.data : [];
  const usdt = list.find(
    (a) => String(a.contractAddress || "").toLowerCase() === USDT_BSC.toLowerCase()
  );
  return { data: usdt ? { minDeposit: String(usdt.minDeposit ?? "0"), decimals: usdt.decimals } : null, error: null };
};

// Build (but do NOT send) the deposit plan: calldata, approvals needed, gas estimate.
export const prepareDeposit = async (user, amount, minDeposit = "0") => {
  if (!isPositive(amount)) return { ok: false, error: "Enter an amount" };
  const state = await getDepositWalletState(user);
  const amountWei = toTokenUnits(amount, USDT_DECIMALS);
  if (isPositive(minDeposit) && amountWei.lt(toTokenUnits(minDeposit, USDT_DECIMALS))) {
    return { ok: false, state, error: `Minimum deposit is ${minDeposit} USDT` };
  }
  const needsApprove = state.allowanceWei.lt(amountWei);
  const approveData = erc20.encodeFunctionData("approve", [ASTER_VAULT_BSC, amountWei]); // exact amount
  const depositData = vault.encodeFunctionData("depositFor", [USDT_BSC, user, amountWei, PERP_BROKER]);

  const est = await withProvider(async (provider) => {
    const gasPrice = await provider.getGasPrice();
    let approveGas = ethers.BigNumber.from(0);
    if (needsApprove) {
      approveGas = await provider.estimateGas({ from: user, to: USDT_BSC, data: approveData });
    }
    let depositGas = FALLBACK_DEPOSIT_GAS;
    let depositSimulated = false;
    let depositSimError = null;
    try {
      depositGas = await provider.estimateGas({ from: user, to: ASTER_VAULT_BSC, data: depositData, value: 0 });
      depositSimulated = true;
    } catch (e) {
      // Expected before approval / without USDT: the vault call reverts in simulation.
      depositSimError = (e && (e.reason || e.code)) || "simulation failed";
    }
    return { gasPrice, approveGas, depositGas, depositSimulated, depositSimError };
  });

  const totalGas = est.approveGas.add(est.depositGas).mul(GAS_BUFFER_PCT).div(100);
  const gasCostWei = totalGas.mul(est.gasPrice.mul(120).div(100));
  const plan = {
    amount: fromTokenUnits(amountWei, USDT_DECIMALS),
    amountWei,
    needsApprove,
    approve: needsApprove ? { to: USDT_BSC, data: approveData, gasLimit: est.approveGas } : null,
    deposit: { to: ASTER_VAULT_BSC, data: depositData, gasLimit: est.depositGas },
    gasPriceGwei: ethers.utils.formatUnits(est.gasPrice, "gwei"),
    gasCostBnb: fromTokenUnits(gasCostWei, 18),
    depositSimulated: est.depositSimulated,
    depositSimError: est.depositSimError,
    state,
  };
  if (state.usdtWei.lt(amountWei)) {
    return { ok: false, plan, state, error: `Not enough USDT. Your wallet has ${toPlain(state.usdt)} USDT.` };
  }
  if (state.bnbWei.lt(gasCostWei)) {
    return {
      ok: false,
      plan,
      state,
      lowGas: true,
      error: `Not enough BNB for gas. ${needsApprove ? "Approve + deposit need" : "The deposit needs"} about ${toPlain(
        plan.gasCostBnb
      )} BNB; you have ${toPlain(state.bnb)} BNB.`,
    };
  }
  return { ok: true, plan, state, error: null };
};

// Broadcast the plan via the app's existing native-signing EVM path (legacy gasPrice).
// onStep: 'approving' | 'depositing' | 'waiting'
export const executeDeposit = async (user, plan, onStep) => {
  let approveHash = null;
  if (plan.needsApprove) {
    if (onStep) onStep("approving");
    const a = await fustionEvmTxManager(BSC_CHAIN_KEY, user, "0", plan.approve.to, plan.approve.data);
    approveHash = a.txResponse && a.txResponse.hash;
    if (!a.status) return { ok: false, step: "approve", error: a.error || "Approval failed", approveHash };
  }
  if (onStep) onStep("depositing");
  const d = await fustionEvmTxManager(BSC_CHAIN_KEY, user, "0", plan.deposit.to, plan.deposit.data);
  const txHash = d.txResponse && d.txResponse.hash;
  if (!d.status) return { ok: false, step: "deposit", error: d.error || "Deposit failed", approveHash, txHash };
  if (onStep) onStep("waiting");
  return { ok: true, approveHash, txHash };
};

// ---------------------------------------------------------------- withdraw

const WITHDRAW_DOMAIN = {
  name: "Aster",
  version: "1",
  chainId: 56,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};
// Aster docs: chainId -> "destination Chain" name.
const WITHDRAW_CHAIN_NAMES = { 1: "ETH", 56: "BSC", 42161: "Arbitrum" };
const ACTION_TYPES = {
  Action: [
    { name: "type", type: "string" },
    { name: "destination", type: "address" },
    { name: "destination Chain", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "fee", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "aster chain", type: "string" },
  ],
};
const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

const plainAmount = (v) => fromUnits(toUnits(toPlain(v))); // trailing zeros stripped

// Limits + fee: signed POST /fapi/v3/aster/user-withdraw-info, fallback to the public fee estimate.
export const fetchWithdrawInfo = async (agent, user) => {
  const info = await asterSignedRequest({ agent, user, method: "POST", path: "/fapi/v3/aster/user-withdraw-info" });
  const chain = info.data?.balances?.USDT?.chainBalances?.["56"];
  if (!info.error && chain) {
    return {
      data: { maxAmount: String(chain.perpMaxWithdrawAmount ?? "0"), fee: String(chain.withdrawFee ?? "0"), source: "user-withdraw-info" },
      error: null,
      code: null,
    };
  }
  const est = await asterFetch(
    "https://www.asterdex.com/bapi/futures/v1/public/future/aster/estimate-withdraw-fee?chainId=56&network=EVM&currency=USDT&accountType=perp",
    { timeoutMs: 15000 }
  );
  const fee = est.data?.data?.gasCost;
  return {
    data: fee !== undefined ? { maxAmount: null, fee: toPlain(fee), source: "estimate-withdraw-fee" } : null,
    error: info.error || est.error,
    code: info.code,
    agentInvalid: info.agentInvalid,
  };
};

// Every asset the user can withdraw, per chain: POST /fapi/v3/aster/user-withdraw-info
// -> { data: [{ asset, total, chains: [{ chainId, max, fee }] }], error, code }.
// Only EVM chains Aster's withdraw signer supports (1, 56, 42161); max = perp max for that chain
// (Aster caps it by the chain's liquidity).
export const fetchWithdrawOptions = async (agent, user) => {
  const info = await asterSignedRequest({ agent, user, method: "POST", path: "/fapi/v3/aster/user-withdraw-info" });
  if (info.error) return { data: null, error: info.error, code: info.code, agentInvalid: info.agentInvalid };
  const balances = (info.data && info.data.balances) || {};
  const data = Object.keys(balances)
    .map((asset) => {
      const b = balances[asset] || {};
      const chains = Object.values(b.chainBalances || {})
        .filter((c) => WITHDRAW_CHAIN_NAMES[String(c.chainId)])
        .map((c) => ({ chainId: Number(c.chainId), max: toPlain(String(c.perpMaxWithdrawAmount ?? "0")), fee: toPlain(String(c.withdrawFee ?? "0")) }));
      return { asset, total: toPlain(String(b.perpTotalWithdrawAmount ?? "0")), chains };
    })
    .filter((a) => a.chains.length > 0);
  return { data, error: null, code: null };
};

// Public fee estimate for one asset/chain (fallback when user-withdraw-info has no fee).
export const estimateWithdrawFee = async (asset, chainId) => {
  const est = await asterFetch(
    `https://www.asterdex.com/bapi/futures/v1/public/future/aster/estimate-withdraw-fee?chainId=${chainId}&network=EVM&currency=${encodeURIComponent(
      asset
    )}&accountType=perp`,
    { timeoutMs: 15000 }
  );
  const fee = est.data && est.data.data ? est.data.data.gasCost : undefined;
  return fee !== undefined && fee !== null ? toPlain(fee) : null;
};

const MESSAGE_DOMAIN = {
  name: "AsterSignTransaction",
  version: "1",
  chainId: 1666,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};
const MESSAGE_TYPES = { Message: [{ name: "msg", type: "string" }] };

const recovers = (fn, user) => {
  try {
    return fn().toLowerCase() === user.toLowerCase();
  } catch (e) {
    return false;
  }
};

// Withdraw signed ENTIRELY by the main wallet (no agent / trading key):
//  - EIP-712 "Action" (domain Aster, chainId 56) -> userSignature
//  - the v3 request itself with user = signer = main wallet (Message{msg}, chainId 1666)
// Both signatures come from ONE native call (one PIN/biometric prompt) that only accepts an
// own-address USDT withdraw. Both are checked locally with ethers before anything is sent.
// POST /fapi/v3/aster/user-withdraw. Resolves { data, error, code } (never throws for API errors).
export const withdrawWithMainWallet = async (user, amount, fee, { asset = "USDT", chainId = 56 } = {}) => {
  const wChain = WITHDRAW_CHAIN_NAMES[String(chainId)];
  if (!wChain) throw new Error("Unsupported chain");
  const domain = { ...WITHDRAW_DOMAIN, chainId: Number(chainId) };
  // Guard: asset + network must be in Aster's live withdraw list (when it is available).
  const lists = await getAssetLists().catch(() => null);
  if (lists && lists.withdraw && lists.withdraw.length && !lists.withdraw.some((a) => a.chainId === Number(chainId) && a.name === asset)) {
    const err = new Error(`${asset} can't be withdrawn to that network. Nothing was sent.`);
    err.step = "verify";
    throw err;
  }
  const owner = ethers.utils.getAddress(user);
  await syncServerTime();
  const userNonce = String(Math.trunc(getServerNowMs()) * 1000); // docs: ms * 1000
  const message = {
    type: "Withdraw",
    destination: owner,
    "destination Chain": wChain,
    token: asset,
    amount: plainAmount(amount),
    fee: plainAmount(fee),
    nonce: userNonce,
    "aster chain": "Mainnet",
  };
  const query = new URLSearchParams({
    user: owner,
    signer: owner,
    chainId: String(chainId),
    asset,
    amount: message.amount,
    fee: message.fee,
    receiver: owner,
    userNonce,
    nonce: String(nextNonceMicros()),
  }).toString();

  const signed = await signAsterWithdrawRequest({
    walletAddress: owner,
    typedData: {
      primaryType: "Action",
      types: { EIP712Domain: EIP712_DOMAIN_TYPE, ...ACTION_TYPES },
      domain,
      message,
    },
    requestQuery: query,
  });

  const okAction = recovers(
    () => ethers.utils.verifyTypedData(domain, ACTION_TYPES, message, signed.userSignature),
    owner
  );
  const okRequest =
    signed.msg === `${query}&userSignature=${signed.userSignature}` &&
    recovers(() => ethers.utils.verifyTypedData(MESSAGE_DOMAIN, MESSAGE_TYPES, { msg: signed.msg }, signed.signature), owner);
  if (!okAction || !okRequest) {
    const err = new Error("Local signature check failed. Nothing was sent.");
    err.step = "verify";
    throw err;
  }

  const res = await asterFetch("/fapi/v3/aster/user-withdraw", {
    method: "POST",
    body: `${signed.msg}&signature=${signed.signature}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return { data: res.error ? null : res.data, error: res.error, code: res.code };
};

// POST /fapi/v3/aster/deposit-withdraw-history (agent-signed). Returns the perp WITHDRAW rows,
// newest first: [{ id, amount, state: PROCESSING|SUCCESS|FAILED, txHash, time }].
export const fetchWithdrawHistory = async (agent, user) => {
  const res = await asterSignedRequest({ agent, user, method: "POST", path: "/fapi/v3/aster/deposit-withdraw-history" });
  if (res.error) return { data: null, error: res.error, code: res.code, agentInvalid: res.agentInvalid };
  const rows = (Array.isArray(res.data) ? res.data : [])
    .filter((r) => r && r.type === "WITHDRAW")
    .sort((a, b) => Number(b.time) - Number(a.time));
  return { data: rows, error: null, code: null };
};
