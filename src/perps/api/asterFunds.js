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

// Wallet nonces (read-only), used to time "Deposit sent" and to resume after a relaunch.
export const getPendingNonce = (user) => withProvider((provider) => provider.getTransactionCount(user, "pending"));
export const getLatestNonce = (user) => withProvider((provider) => provider.getTransactionCount(user, "latest"));

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
export const withdrawWithMainWallet = async (user, amount, fee) => {
  const owner = ethers.utils.getAddress(user);
  await syncServerTime();
  const userNonce = String(Math.trunc(getServerNowMs()) * 1000); // docs: ms * 1000
  const message = {
    type: "Withdraw",
    destination: owner,
    "destination Chain": "BSC",
    token: "USDT",
    amount: plainAmount(amount),
    fee: plainAmount(fee),
    nonce: userNonce,
    "aster chain": "Mainnet",
  };
  const query = new URLSearchParams({
    user: owner,
    signer: owner,
    chainId: "56",
    asset: "USDT",
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
      domain: WITHDRAW_DOMAIN,
      message,
    },
    requestQuery: query,
  });

  const okAction = recovers(
    () => ethers.utils.verifyTypedData(WITHDRAW_DOMAIN, ACTION_TYPES, message, signed.userSignature),
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
