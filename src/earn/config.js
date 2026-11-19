import { Networks, StrKey } from '@stellar/stellar-sdk/axios';
import { ENVIRONMENT, SRB_RPC_URL, STELLAR_URL } from '../Dashboard/constants';
import { SRBRPC } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/ExchangeConstants';

const NetworkConfig = {
  network: ENVIRONMENT === "TESTNET" ? "testnet" : "mainnet",
  signerNetwork: ENVIRONMENT === "TESTNET" ? "testnet" : "public",
  networkPassphrase: ENVIRONMENT === "TESTNET" ? Networks.TESTNET : Networks.PUBLIC,
  rpcUrl: SRBRPC,
  horizonUrl: STELLAR_URL.URL,
  explorerBaseUrl: STELLAR_URL.EXPERT_URL,
  vaults: ENVIRONMENT === "TESTNET" ? [] : [],
};

const isValidVault = v =>
  StrKey.isValidContract(v.vaultAddress) &&
  StrKey.isValidContract(v.strategyAddress) &&
  StrKey.isValidContract(v.underlyingAsset.contractId);

export const getEarnEnvironment = () => {
  const env = NetworkConfig;
  return { ...env, vaults: env.vaults.filter(isValidVault) };
};

export const getExplorerTxUrl = hash => `${getEarnEnvironment().explorerBaseUrl}/tx/${hash}`;
export const getExplorerContractUrl = address => `${getEarnEnvironment().explorerBaseUrl}/contract/${address}`;
