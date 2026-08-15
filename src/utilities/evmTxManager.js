import { NativeModules } from "react-native";
import { ethers } from "ethers";
import { CHAINS } from "./TokenUtils";
import { PPOST, proxyRequest } from "../Dashboard/exchange/crypto-exchange-front-end-main/src/api";

const GAS_PRICE_BUFFER_PCT = 120; // 20% extra
const GAS_LIMIT_BUFFER_PCT = 120; // 20% extra
const NATIVE_TRANSFER_GAS_LIMIT = ethers.BigNumber.from(21000);

const OP_STACK_CHAIN_IDS = new Set([10, 8453, 34443, 7777777]); // OPT, Base, Mode, Zora
const OPT_L1_FEE_BUFFER = ethers.BigNumber.from("2000000000"); // ~2 Gwei fixed buffer

export const evmTxManager = async (chainName, fromAddress, amount, toAddress) => {
    const chainConfig = CHAINS[chainName];
    if (!chainConfig) {
        return { status: false, error: `Unsupported chain: ${chainName}` };
    }

    let requestedValue;
    try {
        requestedValue = ethers.utils.parseEther(amount.toString());
    } catch (e) {
        return { status: false, error: "Invalid amount format" };
    }

    if (requestedValue.lte(0)) {
        return { status: false, error: "Amount must be greater than zero" };
    }

    async function prepareUnsignedTxForNativeSign(config) {
        const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);

        const [balance, nonce, feeData] = await Promise.all([
            provider.getBalance(fromAddress),
            provider.getTransactionCount(fromAddress, "pending"),
            provider.getFeeData(),
        ]);

        if (!feeData.gasPrice) {
            throw new Error("Failed to fetch gas price from network");
        }

        const gasPrice = feeData.gasPrice.mul(GAS_PRICE_BUFFER_PCT).div(100);

        const isPlainTransfer = true;
        let gasLimit;
        if (isPlainTransfer) {
            gasLimit = NATIVE_TRANSFER_GAS_LIMIT;
        } else {
            const safeEstimateValue = requestedValue.gte(balance) ? balance : requestedValue;
            gasLimit = await provider.estimateGas({
                to: toAddress,
                from: fromAddress,
                value: safeEstimateValue,
                data: "0x",
            });
        }

        const gasLimitBuffered = gasLimit.mul(GAS_LIMIT_BUFFER_PCT).div(100);
        const gasCost = gasPrice.mul(gasLimitBuffered);

        const isOpStack = OP_STACK_CHAIN_IDS.has(config.chainId);
        const totalGasCost = isOpStack ? gasCost.add(OPT_L1_FEE_BUFFER) : gasCost;

        if (balance.lte(totalGasCost)) {
            throw new Error("Balance too low to cover gas fees");
        }

        let finalValue;
        let isMaxSend = false;

        if (requestedValue.gte(balance)) {
            isMaxSend = true;
            finalValue = balance.sub(totalGasCost);
            if (finalValue.lte(0)) {
                throw new Error("Balance too low to cover gas fees");
            }
        } else {
            const totalRequired = requestedValue.add(totalGasCost);
            if (balance.lt(totalRequired)) {
                throw new Error("Insufficient balance to cover amount and gas");
            }
            finalValue = requestedValue;
        }

        const populatedTx = {
            nonce: ethers.utils.hexlify(nonce),
            gasPrice: ethers.utils.hexlify(gasPrice),
            gasLimit: ethers.utils.hexlify(gasLimitBuffered),
            to: toAddress,
            value: ethers.utils.hexlify(finalValue),
            data: "0x",
            chainId: config.chainId,
        };

        return {
            rawTx: JSON.stringify(populatedTx),
            finalValue,
            isMaxSend,
        };
    }

    try {
        const { rawTx, finalValue, isMaxSend } = await prepareUnsignedTxForNativeSign(chainConfig);

        const signedResult = await NativeModules.TransactionSigner.signTransaction(
            chainConfig.nativeChainKey,
            fromAddress,
            rawTx,
            chainConfig.chainId
        );

        const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
        const txResponse = await provider.sendTransaction(signedResult.signedTx.slice(2));

        return {
            status: true,
            txResponse,
            actualAmountSent: ethers.utils.formatEther(finalValue),
            wasMaxSend: isMaxSend,
        };
    } catch (error) {
        console.error(`${chainName} Error:`, error.message);
        return {
            status: false,
            error: error.message,
        };
    }
};


export const fustionEvmTxManager = async (chainName, fromAddress, amount, toAddress, data) => {
    const chainConfig = CHAINS[chainName];

    const txParams = {
        to: toAddress,
        value: ethers.BigNumber.from(amount),
        data: data
    };

    const rpcUrls = [chainConfig.rpcUrl, ...(chainConfig.backupRPCUrls || [])];

    async function withRpcFallback(operationFn) {
        let lastError;
        for (const url of rpcUrls) {
            try {
                const provider = new ethers.providers.JsonRpcProvider(url);
                return await operationFn(provider);
            } catch (error) {
                console.log(`RPC failed :`, error.message);
                lastError = error;
            }
        }
        throw lastError;
    }

    async function prepareUnsignedTxForNativeSign(config) {
        const [nonce, feeData, gasLimit] = await withRpcFallback((provider) =>
            Promise.all([
                provider.getTransactionCount(fromAddress, 'pending'),
                provider.getFeeData(),
                provider.estimateGas({
                    to: txParams.to,
                    from: fromAddress,
                    value: txParams.value,
                    data: txParams.data || '0x',
                }),
            ])
        );
        const gasPrice = feeData.gasPrice.mul(125).div(100);
        const populatedTx = {
            nonce: ethers.utils.hexlify(nonce),
            gasPrice: ethers.utils.hexlify(gasPrice),
            gasLimit: ethers.utils.hexlify(gasLimit.mul(125).div(100)),
            to: txParams.to,
            value: ethers.utils.hexlify(txParams.value),
            data: txParams.data || '0x',
            chainId: config.chainId,
        };
        return JSON.stringify(populatedTx);
    }

    try {
        const rawUnsignedTx = await prepareUnsignedTxForNativeSign(chainConfig);
        const signedResult = await NativeModules.TransactionSigner.signTransaction(
            chainConfig.nativeChainKey,
            fromAddress,
            rawUnsignedTx,
            chainConfig.chainId
        );

        const { res, err } = await proxyRequest("/v1/eth/transaction/broadcast", PPOST, {
            signedTransactions: [signedResult.signedTx.slice(2)],
            broadcastChain: chainConfig.subName === "BNB" ? "BSC" : chainConfig.subName
        });

        if (err?.status) {
            return {
                error: "Tx broadcast faild",
                status: false,
            };
        }

        const txHash = res?.results?.[0]?.transactionHash;
        if (!txHash) {
            return {
                error: "No txHash in broadcast",
                status: false,
            };
        }

        console.log('Tx sent, hash:', txHash);

        const TIMEOUT_MS = 90_000;
        const receipt = await Promise.race([
            withRpcFallback((provider) => provider.waitForTransaction(txHash, 1)),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Tx confirmation timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
            ),
        ]);

        if (receipt.status === 1) {
            console.log('Tx confirmed:', receipt.transactionHash);
            return {
                txResponse: { hash: txHash },
                status: true,
            };
        } else {
            console.info('Tx failed on-chain:', receipt.transactionHash);
            return {
                txResponse: { hash: txHash },
                receipt: receipt,
                status: false,
                error: 'Transaction reverted on-chain',
            };
        }
    } catch (error) {
        console.error(`${chainName} Error:`, error.message);
        return {
            error: error.message,
            status: false,
        };
    }
};
