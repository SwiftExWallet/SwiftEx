// Main-wallet signature for an Aster withdraw — uses the Aster-only native method
// TransactionSigner.signAsterWithdraw (Android tested, iOS untested). The existing
// NativeSign.js / signTypedData path is not used or changed.
// Native side only signs domain "Aster" / primaryType "Action" / type "Withdraw" to the
// signing wallet's own address, behind the same PIN/biometric gate as other signing.
// Never log the payload or the signature.
import { NativeModules } from "react-native";

const signer = () => NativeModules.TransactionSigner;

// OTA guard: new JS on an older native build has no Aster methods -> withdraw stays off.
export const isAsterWithdrawSigningAvailable = () => {
  const s = signer();
  return !!s && typeof s.signAsterWithdraw === "function" && typeof s.signAsterWithdrawRequest === "function";
};

// One native call (one PIN/biometric prompt): signs the withdraw Action AND the v3 request
// (user = signer = main wallet) with the main wallet key. Native checks that the query is an
// own-address USDT withdraw matching the Action. Resolves { userSignature, msg, signature }.
export const signAsterWithdrawRequest = async ({ walletAddress, typedData, requestQuery }) => {
  if (!isAsterWithdrawSigningAvailable()) {
    throw new Error("Withdraw signing is not available in this app version");
  }
  const result = await signer().signAsterWithdrawRequest(
    "bsc",
    walletAddress,
    JSON.stringify({
      primaryType: typedData.primaryType,
      types: typedData.types,
      domain: typedData.domain,
      message: typedData.message,
    }),
    requestQuery
  );
  if (!result || !result.signature || !result.userSignature || !result.msg) {
    throw new Error("No signature returned");
  }
  return { userSignature: result.userSignature, msg: result.msg, signature: result.signature };
};
