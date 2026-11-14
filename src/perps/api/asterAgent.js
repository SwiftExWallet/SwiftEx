// Enable Trading: create an agent key and have the MAIN wallet approve it on Aster (once).
// Moves no funds and sends no on-chain transaction. Never log keys or signatures.
import { NativeModules } from "react-native";
import { ethers } from "ethers";
import { nativeSign } from "../../utilities/NativeSign";
import { asterFetch, fetchServerTime } from "./asterPublic";
import { saveAgent } from "../storage/agentKeyStore";

export const AGENT_NAME = "@swiftex-mobile";
export const AGENT_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (Aster docs give no max)

// POST /fapi/v3/registerAndApproveAgent (official futures v3 docs): registers + approves the
// agent in one call. Signed by the MAIN wallet over a fixed query-string message.
// (The plain approveAgent / ApproveAgent typed-data path returned "Signature check failed"
// for this wallet, which has not used Aster before.)
const SIGNATURE_CHAIN_ID = 56; // EVM addresses; domain.chainId must equal signatureChainId
const APPROVE_DOMAIN = {
  name: "AsterSignTransaction",
  version: "1",
  chainId: SIGNATURE_CHAIN_ID,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};
const MESSAGE_TYPES = { Message: [{ name: "msg", type: "string" }] };

const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

// 32 bytes straight from the platform CSPRNG (Android SecureRandom / iOS SecRandomCopyBytes)
// via react-native-get-random-values' native module. No JS PRNG involved.
const secureRandom32 = () => {
  const mod = NativeModules.RNGetRandomValues;
  if (!mod || typeof mod.getRandomBase64 !== "function") {
    throw new Error("Secure random source not available");
  }
  const bytes = ethers.utils.base64.decode(mod.getRandomBase64(32));
  if (!bytes || bytes.length !== 32) throw new Error("Secure random source failed");
  return bytes;
};

export const createAgentWallet = () => {
  // Retry in the (astronomically unlikely) case the bytes are not a valid secp256k1 key.
  for (let i = 0; i < 5; i += 1) {
    try {
      return new ethers.Wallet(ethers.utils.hexlify(secureRandom32()));
    } catch (e) {
      // try again
    }
  }
  throw new Error("Could not create a trading key");
};

const approveError = (step, message) => {
  const err = new Error(message);
  err.step = step;
  return err;
};

// Full Enable Trading flow. Resolves to the stored agent record.
// Steps: create key -> server time -> main wallet signs (PIN) -> verify locally -> POST -> save.
export const enableTrading = async (mainAddress) => {
  if (!ethers.utils.isAddress(mainAddress || "")) {
    throw approveError("wallet", "Perps needs an EVM wallet");
  }
  const user = ethers.utils.getAddress(mainAddress);
  const agentWallet = createAgentWallet();

  const time = await fetchServerTime();
  if (!time.data) throw approveError("time", time.error || "Could not reach Aster");
  const nonce = time.data * 1000; // microseconds
  const expired = time.data + AGENT_VALIDITY_MS; // ms

  // Exact field order from the docs:
  // user, nonce, agentName, agentAddress, expired, signatureChainId,
  // canSpotTrade, canPerpTrade, canWithdraw, ipWhitelist
  const params = [
    ["user", user],
    ["nonce", String(nonce)],
    ["agentName", AGENT_NAME],
    ["agentAddress", agentWallet.address],
    ["expired", String(expired)],
    ["signatureChainId", String(SIGNATURE_CHAIN_ID)],
    ["canSpotTrade", "false"],
    ["canPerpTrade", "true"],
    ["canWithdraw", "false"],
    ["ipWhitelist", ""],
  ];
  const msg = params.map(([k, v]) => `${k}=${v}`).join("&");

  let signature;
  try {
    const res = await nativeSign({
      type: "eip712",
      chainName: "bsc",
      walletAddress: user,
      typedData: {
        primaryType: "Message",
        types: { EIP712Domain: EIP712_DOMAIN_TYPE, ...MESSAGE_TYPES },
        domain: APPROVE_DOMAIN,
        message: { msg },
      },
    });
    signature = res.signature;
  } catch (e) {
    throw approveError("sign", "Signing was cancelled or failed");
  }

  // Safety: the native (web3j) signature must recover to the user's address with ethers.
  let recovered = null;
  try {
    recovered = ethers.utils.verifyTypedData(APPROVE_DOMAIN, MESSAGE_TYPES, { msg }, signature);
  } catch (e) {
    recovered = null;
  }
  const verified = !!recovered && recovered.toLowerCase() === user.toLowerCase();
  if (!verified) {
    throw approveError("verify", "Local signature check failed. Nothing was sent.");
  }

  // Body = the signed msg byte-for-byte + signature (no values need encoding: no & = + % or spaces).
  const body = `${msg}&signature=${signature}`;
  const res = await asterFetch("/fapi/v3/registerAndApproveAgent", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeoutMs: 20000,
  });
  if (res.error || !res.data || res.data.code !== 200) {
    const detail = res.error || (res.data && (res.data.msg || res.data.error)) || "";
    throw approveError("approve", `Aster rejected the request${detail ? `: ${detail}` : ""}`);
  }

  const record = {
    pk: agentWallet.privateKey,
    address: agentWallet.address,
    expiresAt: expired,
    createdAt: Date.now(),
  };
  await saveAgent(user, record);
  return record;
};
