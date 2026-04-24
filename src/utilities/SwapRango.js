import { NativeModules } from 'react-native';
import { PPOST, proxyRequest } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/api';
import { ethers } from 'ethers';

export const swapBestRoute = async (fromTokenBlockchain, fromTokenSymbol, fromTokenAddress,
    toTokenBlockchain, toTokenSymbol, toTokenAddress, amount, slippage = "1.0") => {
    try {
        const response = await proxyRequest('/v1/swap/rango/best/route', PPOST, {
            from: {
                blockchain: fromTokenBlockchain,
                symbol: fromTokenSymbol,
                address: fromTokenAddress
            },
            to: {
                blockchain: toTokenBlockchain,
                symbol: toTokenSymbol,
                address: toTokenAddress
            },
            amount: amount,
            slippage: slippage
        });
        if (response.err?.status) {
            return {
                status: false,
                error: response.err.message
            }
        }
        if (response.res.diagnosisMessages.length > 0) {
            return {
                status: false,
                error: response.res?.diagnosisMessages[0]
            }
        }else{
            return {
                status: true,
                response: {
                    provider: "Rango",
                    rate: parseFloat(response.res.result.outputAmount) / parseFloat(response.res.requestAmount),
                    feeTire: response.res.result.swaps[0]?.routes?.[0]?.nodes?.[0]?.nodes?.[0]?.percent || 1,
                    networkFee: response.res.result.swaps[0].fee[1].amount,
                    outputAmount: response.res.result.outputAmount,
                    minimumReceive: response.res.result.outputAmount,
                    time: response.res.result.swaps.reduce((sum, s) => sum + s.estimatedTimeInSeconds, 0),
                    fromToken: response.res.from.symbol,
                    toToken: response.res.to.symbol,
                    fromChain: response.res.from.blockchain,
                    toChain: response.res.to.blockchain,
                    isFullNull: false,
                    response:response.res
                }
            }
        }
    } catch (error) {
        return {
            status: false,
            error: error
        }
    }
}

export const swapConfirmRoute = async (swapRequestId, fromBlockchain, toBlockchain, fromAddress, toAddress) => {
    try {
        const response = await proxyRequest('/v1/swap/rango/confirm/route', PPOST, {
            requestId: swapRequestId,
            sourceChain: fromBlockchain,
            destinationChain: toBlockchain,
            fromAddress: fromAddress,
            toAddress: toAddress
        });
        if (response.err?.status) {
            return {
                status: false,
                error: response.err.message
            }
        }
        return {
            status: true,
            response: response.res
        }
    } catch (error) {
        return {
            status: false,
            error: error
        }
    }
}

export const swapPrepareTx = async (swapRequestId, numberOfswaps = 1) => {
    try {
        const response = await proxyRequest('/v1/swap/rango/prepare/tx', PPOST, {
            requestId: swapRequestId,
            swaps: numberOfswaps
        });
        if (response.err?.status) {
            return {
                status: false,
                error: response.err.message
            }
        }
        return {
            status: true,
            response: response.res
        }
    } catch (error) {
        return {
            status: false,
            error: error
        }
    }
}

export const swapTxApproval = async (swapRequestId, txId) => {
    try {
        const response = await proxyRequest('/v1/swap/rango/tx/approval', PPOST, {
            requestId: swapRequestId,
            txId: txId
        });
        if (response.err?.status) {
            return {
                status: false,
                error: response.err.message
            }
        }
        return {
            status: true,
            response: response.res
        }
    } catch (error) {
        return {
            status: false,
            error: error
        }
    }
}

export const swapTxSign = async (activeChain, activeWalletAddress, response) => {
    try {
        const provider = new ethers.providers.JsonRpcProvider(
            activeChain.rpcUrl
        );

        const { TransactionSigner } = NativeModules;

        let nonce = await provider.getTransactionCount(
            activeWalletAddress,
            "pending"
        );

        const feeData = await provider.getFeeData();

        const signedRawTxs = [];

        for (const item of response) {
            if (!item?.ok || !item?.transaction) continue;

            const rangoTx = item.transaction;

            const tx = {
                nonce: ethers.utils.hexlify(nonce++),
                to: rangoTx.to,
                value: rangoTx.value || "0x0",
                data: rangoTx.data,
                gasLimit: rangoTx.gasLimit,
                chainId: activeChain.chainId,

                gasPrice: ethers.utils.hexlify(
                    rangoTx.gasPrice ||
                    feeData.gasPrice ||
                    feeData.maxFeePerGas
                ),
            };

            const signedTx = await TransactionSigner.signTransaction(
                "eth",
                activeWalletAddress,
                JSON.stringify(tx),
                Number(activeChain.chainId)
            );

            let rawTx = signedTx.signedTx;

            if (rawTx.startsWith("0x0x")) {
                rawTx = rawTx.replace(/^0x/, "");
            }

            signedRawTxs.push(rawTx);
        }

        const { res, err } = await proxyRequest("/v1/eth/transaction/broadcast", PPOST, { signedTransactions: signedRawTxs, broadcastChain: activeChain.symbol });
        if (err?.status) {
            return {
                status: false,
                error: err.message || "Broadcast failed",
            };
        }
        console.info("Broadcasted:", res);
        return {
            status: true,
            response: res,
        };
    } catch (error) {
        return {
            status: false,
            error: error.message,
        };
    }
}