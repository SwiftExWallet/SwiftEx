import { NativeModules } from "react-native";
import { ethers } from "ethers";
import { CHAINS } from "./TokenUtils";

export const evmTxManager = async (chainName, fromAddress, amount, toAddress) => {
    const chainConfig = CHAINS[chainName];
    const txParams = {
        to: toAddress,
        value: ethers.utils.parseEther(amount),
        data: "0x"
    };

    async function prepareUnsignedTxForNativeSign(config) {
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const [balance, nonce, feeData] = await Promise.all([
        provider.getBalance(fromAddress),
        provider.getTransactionCount(fromAddress, 'pending'),
        provider.getFeeData(),
    ]);

    const gasPrice = feeData.gasPrice.mul(120).div(100);
    const gasLimit = await provider.estimateGas({
        to: toAddress,
        from: fromAddress,
        value: txParams.value,
        data: "0x",
    });
    const gasLimitBuffered = gasLimit.mul(120).div(100);

    const gasCost = gasPrice.mul(gasLimitBuffered);
    const totalRequired = txParams.value.add(gasCost);
    if (balance.lt(totalRequired)) {
        throw new Error("Insufficient balance to cover amount and gas");
    }

    const populatedTx = {
        nonce: ethers.utils.hexlify(nonce),
        gasPrice: ethers.utils.hexlify(gasPrice),
        gasLimit: ethers.utils.hexlify(gasLimitBuffered),
        to: toAddress,
        value: ethers.utils.hexlify(txParams.value),
        data: "0x",
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
        const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
        const txResponse = await provider.sendTransaction(signedResult.signedTx.slice(2));
        return{
            txResponse:txResponse,
            status:true,
        }
    } catch (error) {
        console.error(`${chainName} Error:`, error.message);
        return{
            error:error.message,
            status:false,
        }
    }
};


export const fustionEvmTxManager = async (chainName, fromAddress, amount, toAddress, data) => {
    const chainConfig = CHAINS[chainName];
    
    const txParams = {
        to: toAddress,
        value: ethers.BigNumber.from(amount), 
        data: data
    };

    async function prepareUnsignedTxForNativeSign(config) {
        const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
        const [nonce, feeData, gasLimit] = await Promise.all([
            provider.getTransactionCount(fromAddress, 'pending'),
            provider.getFeeData(),
            provider.estimateGas({
                to: txParams.to,
                from: fromAddress,
                value: txParams.value,
                data: txParams.data || '0x',
            }),
        ]);
        const gasPrice = feeData.gasPrice.mul(120).div(100);
        const populatedTx = {
            nonce: ethers.utils.hexlify(nonce),
            gasPrice: ethers.utils.hexlify(gasPrice),
            gasLimit: ethers.utils.hexlify(gasLimit.mul(120).div(100)),
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

        const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
        const txResponse = await provider.sendTransaction(signedResult.signedTx.slice(2));
        console.info(txResponse);
        return {
            txResponse: txResponse,
            status: true,
        };
    } catch (error) {
        console.error(`${chainName} Error:`, error.message);
        return {
            error: error.message,
            status: false,
        };
    }
};
