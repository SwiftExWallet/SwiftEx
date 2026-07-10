import { NativeModules } from 'react-native';
import { PPOST, proxyRequest } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/api';
import { ethers } from 'ethers';
import { CHAINS, isNativeTokenAddress } from './TokenUtils';
import CustomInfoProvider from '../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';
import ShortTermStorage from './ShortTermStorage';
import Web3 from 'web3';

export const swapBestRoute = async (
    fromTokenBlockchain, fromTokenSymbol, fromTokenAddress,
    toTokenBlockchain, toTokenSymbol, toTokenAddress,
    amount, slippage = "1.0"
) => {
    try {
        const response = await proxyRequest('/v1/swap/rango/best/route', PPOST, {
            from: { blockchain: fromTokenBlockchain, symbol: fromTokenSymbol, address: fromTokenAddress },
            to: { blockchain: toTokenBlockchain, symbol: toTokenSymbol, address: toTokenAddress },
            amount,
            slippage:slippage.toString()
        });

        if (response.err?.status) {
            return { status: false, error: response.err.message };
        }
        if (response.res.diagnosisMessages.length > 0) {
            return { status: false, error: response.res?.diagnosisMessages[0] };
        }

        const swaps = response.res.result.swaps;
        const lastSwap = swaps[swaps.length - 1];
        const feeTier = lastSwap?.routes?.[0]?.nodes?.[0]?.nodes?.[0]?.percent || 1;

        return {
            status: true,
            response: {
                provider: "Rango",
                rate: parseFloat(response.res.result.outputAmount) / parseFloat(response.res.requestAmount),
                feeTire: feeTier,
                networkFee: swaps[0].fee[0].amount,
                outputAmount: response.res.result.outputAmount,
                minimumReceive: response.res.result.outputAmount,
                time: swaps.reduce((sum, s) => sum + s.estimatedTimeInSeconds, 0),
                fromToken: response.res.from.symbol,
                toToken: response.res.to.symbol,
                fromChain: response.res.from.blockchain,
                toChain: response.res.to.blockchain,
                isFullNull: false,
                response: response.res
            },
            suggestSlippage:getAllRecommendedSlippage(response.res)
        };
    } catch (error) {
        return { status: false, error };
    }
};

export const swapConfirmRoute = async (swapRequestId, fromBlockchain, toBlockchain, fromAddress, toAddress) => {
    try {
        const response = await proxyRequest('/v1/swap/rango/confirm/route', PPOST, {
            requestId: swapRequestId,
            sourceChain: fromBlockchain,
            destinationChain: toBlockchain,
            fromAddress,
            toAddress
        });
        if (response.err?.status) {
            return { status: false, error: response.err.message };
        }
        return { status: true, response: response.res };
    } catch (error) {
        return { status: false, error };
    }
};

export const swapPrepareTx = async (swapRequestId, numberOfswaps = 1) => {
    try {
        const response = await proxyRequest('/v1/swap/rango/prepare/tx', PPOST, {
            requestId: swapRequestId,
            swaps: numberOfswaps
        });
        if (response.err?.status) {
            return { status: false, error: response.err.message };
        }
        return { status: true, response: response.res };
    } catch (error) {
        return { status: false, error };
    }
};

export const swapTxApproval = async (swapRequestId, txId) => {
    try {
        const response = await proxyRequest('/v1/swap/rango/tx/approval', PPOST, {
            requestId: swapRequestId,
            txId
        });
        if (response.err?.status) {
            return { status: false, error: response.err.message };
        }
        return { status: true, response: response.res };
    } catch (error) {
        return { status: false, error };
    }
};

export const swapTxSign = async (activeChain, activeWalletAddress, response) => {
    try {
        const provider = new ethers.providers.JsonRpcProvider(activeChain.rpcUrl);
        const feeData = await provider.getFeeData();
        const allTxHashes = [];

        const FALLBACK_GAS = {
            ARBITRUM: 500000,
            POLYGON: 600000,
        };
        const fallbackGas = FALLBACK_GAS[activeChain.symbol] ?? 300000;

        for (const item of response) {
            if (!item?.ok || !item?.transaction) continue;

            const rangoTx = item.transaction;

            const signAndBroadcast = async (to, data, value, gasLimit) => {
                const nonce = await provider.getTransactionCount(activeWalletAddress, 'pending');

                let resolvedGasPrice;
                if (rangoTx.gasPrice) {
                    resolvedGasPrice = ethers.utils.hexlify(
                        ethers.BigNumber.from(rangoTx.gasPrice.toString())
                    );
                } else {
                    resolvedGasPrice = ethers.utils.hexlify(
                        feeData.gasPrice || feeData.maxFeePerGas
                    );
                }

                let resolvedGasLimit = ethers.utils.hexlify(fallbackGas);

                if (gasLimit) {
                    resolvedGasLimit = ethers.utils.hexlify(ethers.BigNumber.from(gasLimit));
                } else {
                    try {
                        const estimated = await provider.estimateGas({
                            from: activeWalletAddress, to, data, value: value || '0x0',
                        });
                        resolvedGasLimit = ethers.utils.hexlify(estimated.mul(120).div(100));
                    } catch (err) {

                        console.info('[swapTxSign] estimateGas failed:', err?.message, err?.error);
                        if (rangoTx.approveData && rangoTx.approveTo) {
                            throw new Error(`Gas estimation failed for approval tx: ${err?.message}`);
                        }
                        console.info(`[swapTxSign] Using fallback gas limit: ${fallbackGas}`);
                    }
                }

                const tx = {
                    nonce: ethers.utils.hexlify(nonce),
                    to,
                    value: value || '0x0',
                    data: data || '0x',
                    gasLimit: resolvedGasLimit,
                    gasPrice: resolvedGasPrice,
                    chainId: Number(activeChain.chainId),
                };

                const signedTx = await NativeModules.TransactionSigner.signTransaction(
                    "eth",
                    activeWalletAddress,
                    JSON.stringify(tx),
                    Number(activeChain.chainId)
                );

                let rawTx = signedTx.signedTx;
                if (rawTx.startsWith('0x0x')) rawTx = rawTx.replace(/^0x/, '');

                const { res, err } = await proxyRequest("/v1/eth/transaction/broadcast", PPOST, {
                    signedTransactions: [rawTx],
                    broadcastChain: activeChain.symbol
                });

                if (err?.status) throw new Error(err.message || 'Broadcast failed');

                const txHash = res?.results?.[0]?.transactionHash;
                if (!txHash) throw new Error('No txHash in broadcast response');

                return txHash;
            };

            if (rangoTx.approveData && rangoTx.approveTo) {
                const approveTxHash = await signAndBroadcast(
                    rangoTx.approveTo,
                    rangoTx.approveData,
                    '0x0',
                    null
                );
                allTxHashes.push({ type: 'approve', transactionHash: approveTxHash });
                await provider.waitForTransaction(approveTxHash, 1);
                console.info('[swapTxSign] Approval confirmed');
            }

            const swapTo = rangoTx.txTo ?? rangoTx.to;
            const swapData = rangoTx.txData ?? rangoTx.data;

            if (!swapTo || !swapData) {
                console.info('[swapTxSign] Missing txTo/txData');
                continue;
            }

            const swapTxHash = await signAndBroadcast(
                swapTo,
                swapData,
                rangoTx.value ?? '0x0',
                rangoTx.gasLimit ?? null
            );

            allTxHashes.push({ type: 'swap', transactionHash: swapTxHash });
        }

        if (!allTxHashes.length) {
            return { status: false, error: 'No transactions were processed' };
        }

        return { status: true, response: { results: allTxHashes } };
    } catch (error) {
        console.error('[swapTxSign] Error:', error);
        return { status: false, error: error.message };
    }
};

export async function performeRangoSwap(rangoQuoteInfo, state, fromToken, toToken, qouteInfo) {
    try {
        const responses = await swapConfirmRoute(
            rangoQuoteInfo.requestId,
            rangoQuoteInfo.from.blockchain,
            rangoQuoteInfo.to.blockchain,
            fromToken.chain === "STR" ? state.STELLAR_PUBLICK_KEY : state?.wallet?.address,
            toToken.chain === "STR" ? state.STELLAR_PUBLICK_KEY : state?.wallet?.address
        );

        if (!responses.status) {
            CustomInfoProvider.show("error", "!Opps", responses.error || "Route confirmation failed.");
            return {
                status: false,
                error: responses.error || "Route confirmation failed."
            };
        }

        const confirmedSwaps = responses?.response?.result?.swaps;
        const validationStatus = responses?.response?.validationStatus;
        if (Array.isArray(validationStatus)) {
            for (const chain of validationStatus) {
                for (const wallet of chain.wallets) {
                    const failedAsset = wallet.requiredAssets.find(a => !a.ok);
                    if (failedAsset) {
                        CustomInfoProvider.show(
                            "error",
                            "Insufficient Balance",
                            `Not enough ${failedAsset.asset.symbol} on ${failedAsset.asset.blockchain} for ${failedAsset.reason}`
                        );
                        return {
                            status: false,
                            error: `Not enough ${failedAsset.asset.symbol} on ${failedAsset.asset.blockchain} for ${failedAsset.reason}`
                        };
                    }
                }
            }
        }

        const swapPreparedTxRes = await swapPrepareTx(rangoQuoteInfo.requestId, confirmedSwaps?.length || 1);
        const hasError = Array.isArray(swapPreparedTxRes.response) && swapPreparedTxRes.response.some(item => item?.ok === false);
        if (hasError || swapPreparedTxRes.status === false) {
            const firstError = Array.isArray(swapPreparedTxRes.response) ? swapPreparedTxRes.response.find(item => item.ok === false) : null;
            CustomInfoProvider.show("error", "!Opps", firstError?.error || swapPreparedTxRes.error);
            return {
                status: false,
                error: firstError?.error || swapPreparedTxRes.error
            };
        }

        const submitTx = await swapTxSign(CHAINS[fromToken.chain], fromToken.chain === "STR" ? state.STELLAR_PUBLICK_KEY : state?.wallet?.address, swapPreparedTxRes.response);
        if (submitTx.status) {
            if (Array.isArray(submitTx.response.results) && submitTx.response.results.length > 0) {
                const validTxs = submitTx.response.results.filter(item => item.transactionHash);
                for (const tx of validTxs) {
                    await ShortTermStorage.syncTx({
                        requestId: rangoQuoteInfo.requestId,
                        txHash:  tx.transactionHash,
                        walletAddress: state?.wallet?.address,
                        provider: tx?.type === "approve" ? "EVMTX" : "RANGO",
                        fromChain: CHAINS[fromToken.chain].chainName,
                        fromToken: fromToken.symbol,
                        toChain: CHAINS[toToken.chain].chainName,
                        toToken: toToken.symbol,
                        amountIn: rangoQuoteInfo?.requestAmount,
                        amountOut: rangoQuoteInfo?.result?.outputAmount,
                        txType:tx?.type==="approve"?"Token Approval":"Swap",
                        fromTokenMetaData:fromToken.address
                    })
                }
                const isApprovalTx = swapPreparedTxRes.response.some(item => item?.transaction?.isApprovalTx === true);
                if (isApprovalTx) {
                    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                    const web3 = new Web3(CHAINS[fromToken.chain].rpcUrl);
                    for (let i = 0; i < 3; i++) {
                        try {
                            const receipt = await web3.eth.getTransactionReceipt(submitTx.response.results[0].transactionHash);
                            if (receipt?.status === true ||receipt?.status === 1 ||receipt?.status === 1n) {
                                const responseOfrePerform =await rePerform(qouteInfo);
                                return responseOfrePerform;
                            }
                            console.info(`Attempt ${i + 1}: Not confirmed yet`);
                        } catch (err) {
                            console.error(`Attempt ${i + 1} failed`, err);
                        }
                        if (i < 2) {
                            await delay(3000);
                        }
                    }
                    CustomInfoProvider.show("error", "!Opps", "Approval Transaction not confirmed yet.");
                    return {
                        status: false,
                        error: "Approval Transaction not confirmed yet."
                    };
                } else {
                    CustomInfoProvider.show("success", "Swap Success", "Swap initiated successfully.");
                    return {
                        status: true,
                        error: "Swap initiated successfully."
                    };
                }
            }
        } else {
            CustomInfoProvider.show("error", "!Opps", submitTx.error || "Swap failed");
            return {
                status: false,
                error: submitTx.error || "Swap failed."
            };
        }
    } catch (error) {
        return {
            status: false,
            error: error
        };
    }
}

async function rePerform(qouteInfo) {
    try {
        const getRangoSwaps = await swapBestRoute(qouteInfo.fromTokenBlockchain, qouteInfo.fromTokenSymbol, qouteInfo.fromTokenAddress, qouteInfo.toTokenBlockchain, qouteInfo.toTokenSymbol, qouteInfo.toTokenAddress, qouteInfo.amount)
        if (getRangoSwaps.status) {
           const rePerformRes=await performeRangoSwap(getRangoSwaps.response.response, qouteInfo.state, qouteInfo.fromToken, qouteInfo.toToken, qouteInfo);
           return rePerformRes;
        }
    } catch (error) {
        console.error("error in rePerform", error)
        return {
            status: false,
            error: error || "Tx submition failed."
        };
    }
}

// for 1Inch only.
export async function ensureFusionAllowance(tokenAddress, walletAddress, amountBN, provider, chainId) {
    try {
        const LIMIT_ORDER_PROTOCOL = '0x111111125421ca6dc452d289314280a0f8842a65';
        const ERC20_ALLOWANCE_ABI = [
            'function allowance(address owner, address spender) view returns (uint256)',
            'function approve(address spender, uint256 amount) returns (bool)',
        ];
        if (tokenAddress.toLowerCase() === isNativeTokenAddress.toLowerCase()) {
            return { status: true, error:"no approval requird." };
        }
        const rpcProvider = new ethers.providers.JsonRpcProvider(CHAINS[provider].rpcUrl);
        const contract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, rpcProvider);
        const allowance = await contract.allowance(walletAddress, LIMIT_ORDER_PROTOCOL);
        if (ethers.BigNumber.from(allowance).gte(amountBN)) {
            return { status: true, alreadyApproved: true };
        }
        const iface = new ethers.utils.Interface(ERC20_ALLOWANCE_ABI);
        const data = iface.encodeFunctionData('approve', [
            LIMIT_ORDER_PROTOCOL,
            ethers.constants.MaxUint256,
        ]);
        let gasLimit = ethers.BigNumber.from('100000');
        try {
            const estimatedGas = await rpcProvider.estimateGas({
                from: walletAddress,
                to: tokenAddress,
                data,
                value: 0,
            });

            gasLimit = estimatedGas.mul(120).div(100);
        } catch (err) {
            console.info('[ensureFusionAllowance] Gas estimation failed:', err);
            if (err.message?.includes('Insufficient funds')) throw err;
        }
        const nonce = await rpcProvider.getTransactionCount(walletAddress, 'pending');
        const feeData = await rpcProvider.getFeeData();
        let gasPrice;
        if (feeData.gasPrice) {
            gasPrice = feeData.gasPrice;
        } else if (feeData.maxFeePerGas) {
            gasPrice = feeData.maxFeePerGas;
        } else if (feeData.lastBaseFeePerGas) {
            gasPrice = feeData.lastBaseFeePerGas.add(
                feeData.maxPriorityFeePerGas || ethers.utils.parseUnits('2', 'gwei')
            );
        } else {
            gasPrice = await rpcProvider.getGasPrice();
        }
        gasPrice = gasPrice.mul(120).div(100);
        const transaction = {
            nonce: ethers.utils.hexlify(nonce),
            gasPrice: ethers.utils.hexlify(gasPrice),
            gasLimit: ethers.utils.hexlify(gasLimit),
            to: tokenAddress,
            value: '0x0',
            data,
        };

        const signedTx = await NativeModules.TransactionSigner.signTransaction(
            'eth',
            walletAddress,
            JSON.stringify(transaction),
            chainId
        );
        let rawTransaction = signedTx.signedTx;
        if (rawTransaction.startsWith('0x0x')) {
            rawTransaction = rawTransaction.replace(/^0x/, '');
        }
        const txHash = await rpcProvider.send('eth_sendRawTransaction', [rawTransaction]);
        return { status: true, txHash };
    } catch (error) {
        console.error('[ensureFusionAllowance] Error:', error);
        return { status: false, error };
    }
}


export function getAllRecommendedSlippage(data) {
    const slippages = [];
    function traverse(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (
            obj.recommendedSlippage &&
            obj.recommendedSlippage !== null
        ) {
            slippages.push(obj.recommendedSlippage);
        }
        for (const key in obj) {
            traverse(obj[key]);
        }
    }
    traverse(data);
    return slippages;
}