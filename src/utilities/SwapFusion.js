import { NativeModules, Platform } from 'react-native';
import { PPOST, proxyRequest } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/api';
import { ethers } from 'ethers';
import { CHAINS, isNativeTokenAddress, NativeESCROWAddress } from './TokenUtils';
import CustomInfoProvider from '../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';
import ShortTermStorage from './ShortTermStorage';
import Web3 from 'web3';
import { ensureFusionAllowance } from './SwapRango';
import { fustionEvmTxManager } from './evmTxManager';

export const GetFusionSwapQuote = async (fromBlockchain, fromTokenAddress, toBlockchain, toTokenAddress, amount, walletAddress, fromSymbol, toSymbol) => {
    try {
        const response = await proxyRequest('/v1/swap/1inch/fusion-plus/getSwapQuote', PPOST, {
            srcChain: fromBlockchain,
            dstChain: toBlockchain,
            srcTokenAddress: fromTokenAddress === isNativeTokenAddress ? "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" : fromTokenAddress,
            dstTokenAddress: toTokenAddress === isNativeTokenAddress ? "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" : toTokenAddress,
            amount: amount,
            walletAddress: walletAddress
        });

        if (response.err?.status) {
            return { status: false, error: response.err.message };
        }

        return {
            status: true,
            response: {
                provider: "Fusion-Plus",
                rate: parseFloat(response.res.presets["fast"].auctionStartAmount) / parseFloat(response.res.srcTokenAmount),
                feeTire: "",
                networkFee: response.res.presets["fast"].costInDstToken,
                outputAmount: response.res.presets["fast"].auctionStartAmount,
                minimumReceive: response.res.presets["fast"].auctionEndAmount,
                time: response.res.presets["fast"].auctionDuration,
                fromToken: fromSymbol,
                toToken: toSymbol,
                fromChain: fromBlockchain,
                toChain: toBlockchain,
                isFullNull: false,
                response: response.res
            },
            suggestSlippage: []

        };
    } catch (error) {
        console.error("error",error)
        return { status: false, error };
    }
};

const PripareFusionSwap = async (quoteId, walletAddress, txCount = 1) => {
    try {
        const response = await proxyRequest('/v1/swap/1inch/buildFusionPlusOrder', PPOST, {
            quoteId: quoteId,
            walletAddress: walletAddress,
            secretCount: txCount
        });
        if (response.err?.status) {
            return { status: false, error: response.err.message };
        }
        return { status: true, response: response.res };
    } catch (error) {
        return { status: false, error };
    }
};


export async function PerformeFusionSwap(quoteId, state, fromToken, toToken, amount, qouteInfo) {
    try {
        const responses = await PripareFusionSwap(quoteId, state?.wallet?.address, qouteInfo.presets["fast"].secretsCount);
        if (responses.status === false) {
            CustomInfoProvider.show("error", "!Opps", responses.error || "Route confirmation failed.");
            return {
                status: false,
                error: responses.error || "Route confirmation failed."
            };
        }

        const { primaryType, types, domain, message } = responses.response.typedData;
        const typedDataJson = JSON.stringify({
            primaryType,
            types,
            domain,
            message,
        });
        const result = await NativeModules.TransactionSigner.signTypedData(
            fromToken.chain.toLowerCase(),
            state?.wallet?.address,
            typedDataJson,
        );

        const resuleOfAllowance = await ensureFusionAllowance(fromToken.address, state?.wallet?.address, ethers.utils.parseUnits(amount, fromToken?.decimals).toString(), fromToken.chain, fromToken.chainId);
        if (resuleOfAllowance.status === true) {
            const submitResult = await proxyRequest("/v1/swap/1inch/submitFusionPlusOrder", 
                PPOST, {
                chain: fromToken.chain==="BNB"?"BSC":fromToken.chain,
                toChain: toToken.chain==="BNB"?"BSC":toToken.chain,
                order: message,
                signature: result.signature,
                extension: responses.response.extension,
                quoteId: quoteId,
                orderHash: responses?.response?.orderHash,
            });
            if (submitResult.err) {
                CustomInfoProvider.show("error", "!Opps", submitResult.err.message || "Swap failed");
                return {
                    status: false,
                    error: submitResult.err.message || "Swap failed"
                };
            } else {
                await ShortTermStorage.syncTx({
                    quoteId: quoteId,
                    txHash: responses?.response?.orderHash,
                    walletAddress: state?.wallet?.address,
                    provider: "ONEINCH_FUSION_PLUS",
                    fromChain: fromToken.chain==="BNB"?"BSC":fromToken.chain,
                    fromToken: fromToken.symbol,
                    toChain: toToken.chain==="BNB"?"BSC":toToken.chain,
                    toToken: toToken.symbol,
                    amountIn: amount,
                    amountOut: ethers.utils.formatUnits(qouteInfo?.outputAmount||qouteInfo.dstTokenAmount, toToken?.decimals),
                    txType: "Swap",
                    fromTokenMetaData:fromToken.address
                })
                CustomInfoProvider.show("success", "Hurray", "Swap successful!");
                return {
                    status: true,
                    error: "Swap initiated successfully."
                };
            }
        } else {
            CustomInfoProvider.show("error", "!Opps", resuleOfAllowance.error || "Swap fail");
            return {
                status: false,
                error: resuleOfAllowance.error || "Swap fail"
            };
        }
    } catch (error) {
        console.error("error",error)
        return {
            status: false,
            error: error
        };
    }
}

const PripareFusionPlusNativeSwap = async (fromBlockchain,toBlockchain,fromTokenAddress,toTokenAddress, walletAddress,amount ) => {
    try {
        const response = await proxyRequest('/v1/swap/1inch/buildFusionPlusNativeOrder', PPOST, {
            srcChain: fromBlockchain==="BNB"?"BSC":fromBlockchain,
            dstChain: toBlockchain==="BNB"?"BSC":toBlockchain,
            srcTokenAddress: fromTokenAddress === isNativeTokenAddress ? NativeESCROWAddress : fromTokenAddress,
            dstTokenAddress: toTokenAddress === isNativeTokenAddress ? NativeESCROWAddress : toTokenAddress,
            amount: amount.toString(),
            walletAddress: walletAddress
        });
        if (response.err?.status) {
            return { status: false, error: response.err.message };
        }
        return { status: true, response: response.res };
    } catch (error) {
        return { status: false, error };
    }
};

export async function PerformeFusionPlusNativeSwap(state, fromToken, toToken, amount) {
    try {
        const fusionPlusNative = await PripareFusionPlusNativeSwap(fromToken.chain, toToken.chain, fromToken.address, toToken.address, state?.wallet?.address,ethers.utils.parseUnits(amount, fromToken?.decimals));
        if (fusionPlusNative.status === false) {
            CustomInfoProvider.show("error", "!Opps", fusionPlusNative.error || "Route confirmation failed.");
            return {
                status: false,
                error: fusionPlusNative.error || "Route confirmation failed."
            };
        }
        const chainName = fromToken.chain;
        const fromAddress = state?.wallet?.address;
        const txData = fusionPlusNative.response.transaction.data;
        const toAddress = fusionPlusNative.response.transaction.to;
        const amountInWei = fusionPlusNative.response.transaction.value || "0";

        console.info(`Initiating transaction via Native Signer on ${chainName}...`);
        const result = await fustionEvmTxManager(
            chainName,
            fromAddress,
            amountInWei,
            toAddress,
            txData
        );

        if (!result.status) {
            console.info(`${chainName} Transaction Failed:`, result.error);
            throw new error(result.error)
        } 
        console.info(`${chainName} Transaction Success:`, result.txResponse);

        const submitResult = await proxyRequest("/v1/swap/1inch/submitFusionPlusNativeOrder",
            PPOST, {
            orderHash: fusionPlusNative.response.orderHash,
            txHash: result.txResponse.hash,
            srcChain: fromToken.chain==="BNB"?"BSC":fromToken.chain
        });
        if (submitResult.err) {
            CustomInfoProvider.show("error", "!Opps", submitResult.err.message || "Swap failed");
            return {
                status: false,
                error: submitResult.err.message || "Swap failed"
            };
        } else {
            if(submitResult.res.typeTx==="fusion"){
                await ShortTermStorage.syncTx({
                quoteId: fusionPlusNative.response.quote.quoteId?fusionPlusNative.response.quote.quoteId:"null",
                txHash: fusionPlusNative.response.orderHash,
                walletAddress: state?.wallet?.address,
                provider: "ONEINCH_FUSION",
                fromChain: fromToken.chain==="BNB"?"BSC":fromToken.chain,
                fromToken: fromToken.symbol,
                toChain: toToken.chain==="BNB"?"BSC":toToken.chain,
                toToken: toToken.symbol,
                amountIn: amount,
                amountOut: amount,
                txType: "Swap",
                fromTokenMetaData:fromToken.address
            })
            }else{
                await ShortTermStorage.syncTx({
                quoteId: fusionPlusNative.response.quote.quoteId,
                txHash: fusionPlusNative.response.orderHash,
                walletAddress: state?.wallet?.address,
                provider: "ONEINCH_FUSION_PLUS",
                fromChain: fromToken.chain==="BNB"?"BSC":fromToken.chain,
                fromToken: fromToken.symbol,
                toChain: toToken.chain==="BNB"?"BSC":toToken.chain,
                toToken: toToken.symbol,
                amountIn: amount,
                amountOut: ethers.utils.formatUnits(fusionPlusNative.response.quote.dstTokenAmount, toToken?.decimals),
                txType: "Swap",
                fromTokenMetaData:fromToken.address
            })
            }
            CustomInfoProvider.show("success", "Hurray", "Swap successful!");
            return {
                status: true,
                error: "Swap initiated successfully."
            };
        }
    } catch (error) {
        console.error("error", error)
        return {
            status: false,
            error: error
        };
    }
}