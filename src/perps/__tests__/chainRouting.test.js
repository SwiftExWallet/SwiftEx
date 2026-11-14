// Deposit plans are built for, and verified against, the selected chain (BSC 56, Ethereum 1,
// Arbitrum 42161): chainId, app chain key, vault, token contract + decimals, calldata, value.
// Network calls are mocked; nothing is signed or sent.
import { ethers } from "ethers";

jest.mock("../../utilities/TokenUtils", () => ({
  CHAINS: {
    BNB: { chainId: 56, rpcUrl: "https://bsc.example", backupRPCUrls: [] },
    ETH: { chainId: 1, rpcUrl: "https://eth.example", backupRPCUrls: [] },
    ARB: { chainId: 42161, rpcUrl: "https://arb.example", backupRPCUrls: [] },
  },
}));
jest.mock("../../utilities/evmTxManager", () => ({ fustionEvmTxManager: jest.fn() }));
jest.mock("../api/asterWithdrawSigner", () => ({ signAsterWithdrawRequest: jest.fn() }));
jest.mock("../api/asterSigned", () => ({
  asterSignedRequest: jest.fn(),
  getServerNowMs: () => Date.now(),
  syncServerTime: jest.fn(),
  nextNonceMicros: () => 1,
}));
jest.mock("../api/asterPublic", () => ({ asterFetch: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));

const mockLIST = {
  at: Date.now(),
  deposit: [
    { name: "USDT", chainId: 56, contract: "0x55d398326f99059ff775485246999027b3197955", decimals: 18, isNative: false, minDeposit: "0" },
    { name: "BNB", chainId: 56, contract: "0xfdae1ba7c826abdc4c99903c8056f82a1a04a615", decimals: 18, isNative: true, minDeposit: "0" },
    { name: "USDT", chainId: 1, contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6, isNative: false, minDeposit: "0" },
    { name: "ETH", chainId: 1, contract: "0xfdae1ba7c826abdc4c99903c8056f82a1a04a615", decimals: 18, isNative: true, minDeposit: "0" },
    { name: "USDC", chainId: 42161, contract: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6, isNative: false, minDeposit: "0" },
    { name: "ETH", chainId: 42161, contract: "0xfdae1ba7c826abdc4c99903c8056f82a1a04a615", decimals: 18, isNative: true, minDeposit: "0" },
  ],
  withdraw: [{ name: "USDT", chainId: 56 }, { name: "USDC", chainId: 42161 }],
  collateral: {},
};
jest.mock("../api/asterAssets", () => {
  const actual = jest.requireActual("../api/asterAssets");
  return { ...actual, getAssetLists: jest.fn(async () => mockLIST) };
});

const { verifyDepositPlan, executeChainDeposit } = require("../api/asterFunds");
const { PERPS_CHAINS, chainById, txUrl } = require("../api/asterAssets");
const { fustionEvmTxManager } = require("../../utilities/evmTxManager");

const USER = "0x6ad7a4c1f113f65af139831d7d78eaac6b9a4ea0";
const NATIVE = "0xfdAE1bA7C826aBDc4c99903c8056f82a1A04a615";
const vault = new ethers.utils.Interface(["function depositFor(address,address,uint256,uint256) payable"]);
const erc20 = new ethers.utils.Interface(["function approve(address,uint256) returns (bool)"]);

// Builds a plan the same way prepareChainDeposit does (without RPC).
const plan = (chainId, assetName, amountWei, extra = {}) => {
  const chain = chainById(chainId);
  const a = mockLIST.deposit.find((x) => x.chainId === chainId && x.name === assetName);
  const currency = a.isNative ? NATIVE : a.contract;
  const amt = ethers.BigNumber.from(amountWei);
  return {
    chainId,
    chainKey: chain.key,
    asset: a.name,
    contract: a.isNative ? null : a.contract,
    decimals: a.decimals,
    isNative: a.isNative,
    amountWei: amt,
    valueWei: a.isNative ? amt : ethers.BigNumber.from(0),
    needsApprove: !a.isNative,
    approves: a.isNative ? [] : [{ to: a.contract, data: erc20.encodeFunctionData("approve", [chain.vault, amt]) }],
    deposit: { to: chain.vault, data: vault.encodeFunctionData("depositFor", [currency, USER, amt, 0]) },
    ...extra,
  };
};

describe("chain routing", () => {
  test("vaults + explorers per chain (Aster docs)", () => {
    expect(chainById(56).vault).toBe("0x128463A60784c4D3f46c23Af3f65Ed859Ba87974");
    expect(chainById(1).vault).toBe("0x604DD02d620633Ae427888d41bfd15e38483736E");
    expect(chainById(42161).vault).toBe("0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5");
    expect(txUrl(56, "0xab")).toBe("https://bscscan.com/tx/0xab");
    expect(txUrl(1, "0xab")).toBe("https://etherscan.io/tx/0xab");
    expect(txUrl(42161, "0xab")).toBe("https://arbiscan.io/tx/0xab");
    expect(PERPS_CHAINS.map((c) => c.key)).toEqual(["BNB", "ETH", "ARB"]);
  });

  test.each([
    [56, "USDT", "1000000000000000000"],
    [56, "BNB", "500000000000000"],
    [1, "USDT", "1000000"],
    [1, "ETH", "1000000000000000"],
    [42161, "USDC", "2500000"],
    [42161, "ETH", "1000000000000000"],
  ])("valid plan passes: chain %s %s", async (chainId, asset, wei) => {
    await expect(verifyDepositPlan(USER, plan(chainId, asset, wei))).resolves.toBeNull();
  });

  test("mismatches are refused", async () => {
    const p = plan(1, "USDT", "1000000");
    await expect(verifyDepositPlan(USER, { ...p, chainKey: "BNB" })).resolves.toMatch(/Unknown network/);
    await expect(verifyDepositPlan(USER, { ...p, deposit: { ...p.deposit, to: chainById(56).vault } })).resolves.toMatch(/Wrong deposit contract/);
    await expect(verifyDepositPlan(USER, { ...p, decimals: 18 })).resolves.toMatch(/isn't supported/);
    await expect(verifyDepositPlan(USER, { ...p, contract: "0x55d398326f99059ff775485246999027b3197955" })).resolves.toMatch(/Token contract/);
    await expect(verifyDepositPlan(USER, { ...p, amountWei: ethers.BigNumber.from("2000000") })).resolves.toMatch(/amount/);
    await expect(verifyDepositPlan("0x000000000000000000000000000000000000dEaD", p)).resolves.toMatch(/doesn't match/);
    const n = plan(42161, "ETH", "1000");
    await expect(verifyDepositPlan(USER, { ...n, valueWei: ethers.BigNumber.from(0) })).resolves.toMatch(/value/);
    const bad = { ...p, approves: [{ to: p.contract, data: erc20.encodeFunctionData("approve", [chainById(56).vault, p.amountWei]) }] };
    await expect(verifyDepositPlan(USER, bad)).resolves.toMatch(/wrong contract/);
  });

  test("a refused plan never reaches the signer", async () => {
    fustionEvmTxManager.mockClear();
    const p = plan(1, "USDT", "1000000");
    const r = await executeChainDeposit(USER, { ...p, deposit: { ...p.deposit, to: chainById(42161).vault } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^Stopped before sending/);
    expect(fustionEvmTxManager).not.toHaveBeenCalled();
  });

  test("a valid plan is sent on its own chain key, approve first", async () => {
    fustionEvmTxManager.mockReset();
    fustionEvmTxManager.mockResolvedValue({ status: true, txResponse: { hash: "0x1" } });
    const p = plan(42161, "USDC", "2500000");
    const r = await executeChainDeposit(USER, p);
    expect(r.ok).toBe(true);
    expect(fustionEvmTxManager.mock.calls.map((c) => [c[0], c[2], c[3]])).toEqual([
      ["ARB", "0", p.contract],
      ["ARB", "0", chainById(42161).vault],
    ]);
    fustionEvmTxManager.mockReset();
    fustionEvmTxManager.mockResolvedValue({ status: true, txResponse: { hash: "0x2" } });
    const n = plan(56, "BNB", "500000000000000");
    await executeChainDeposit(USER, n);
    expect(fustionEvmTxManager.mock.calls).toHaveLength(1);
    expect(fustionEvmTxManager.mock.calls[0].slice(0, 4)).toEqual(["BNB", USER, "500000000000000", chainById(56).vault]);
  });
});
