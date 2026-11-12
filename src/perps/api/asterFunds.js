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
import { nativeSign } from "../../utilities/NativeSign";
import { asterFetch } from "./asterPublic";
import { asterSignedRequest, getServerNowMs, syncServerTime } from "./asterSigned";
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

const rpcUrls = () => {
  const c = CHAINS[BSC_CHAIN_KEY] || {};
  return [c.rpcUrl, ...(c.backupRPCUrls || [])].filter(Boolean);
};

const withProvider = async (fn) => {
  let lastErr;
  for (const url of rpcUrls()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn(new ethers.providers.StaticJsonRpcProvider(url, 56));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("No BSC RPC available");
};

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
  if (state.usdtWei.lt(amountWei)) return { ok: false, plan, state, error: "Not enough USDT" };
  if (state.bnbWei.lt(gasCostWei)) return { ok: false, plan, state, error: "Need a little BNB for gas" };
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

// Main wallet signs the withdraw Action (native signer, PIN/biometric if enabled), then we verify
// locally with ethers that it recovers the user. Returns { userNonce, userSignature, message }.
export const signWithdraw = async (user, amount, fee) => {
  await syncServerTime();
  const userNonce = Math.trunc(getServerNowMs()) * 1000; // docs: ms * 1000
  const message = {
    type: "Withdraw",
    destination: ethers.utils.getAddress(user),
    "destination Chain": "BSC",
    token: "USDT",
    amount: plainAmount(amount),
    fee: plainAmount(fee),
    nonce: userNonce,
    "aster chain": "Mainnet",
  };
  const { signature } = await nativeSign({
    type: "eip712",
    chainName: "bsc",
    walletAddress: user,
    typedData: {
      primaryType: "Action",
      types: { EIP712Domain: EIP712_DOMAIN_TYPE, ...ACTION_TYPES },
      domain: WITHDRAW_DOMAIN,
      message,
    },
  });
  let recovered = null;
  try {
    recovered = ethers.utils.verifyTypedData(WITHDRAW_DOMAIN, ACTION_TYPES, message, signature);
  } catch (e) {
    recovered = null;
  }
  if (!recovered || recovered.toLowerCase() !== user.toLowerCase()) {
    const err = new Error("Local signature check failed. Nothing was sent.");
    err.step = "verify";
    throw err;
  }
  return { userNonce: String(userNonce), userSignature: signature, message };
};

// POST /fapi/v3/aster/user-withdraw (agent-signed request). Receiver is always the user.
export const submitWithdraw = (agent, user, { amount, fee, userNonce, userSignature }) =>
  asterSignedRequest({
    agent,
    user,
    method: "POST",
    path: "/fapi/v3/aster/user-withdraw",
    params: {
      chainId: "56",
      asset: "USDT",
      amount: plainAmount(amount),
      fee: plainAmount(fee),
      receiver: ethers.utils.getAddress(user),
      userNonce,
      userSignature,
    },
  });
