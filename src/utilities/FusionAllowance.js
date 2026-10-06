import { NativeModules } from 'react-native';
import { ethers } from 'ethers';
import { CHAINS, isNativeTokenAddress } from './TokenUtils';

export async function ensureFusionAllowance(tokenAddress, walletAddress, amountBN, provider, chainId) {
  try {
    const limitOrderProtocol = '0x111111125421ca6dc452d289314280a0f8842a65';
    const erc20AllowanceAbi = [
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)',
    ];

    if (tokenAddress.toLowerCase() === isNativeTokenAddress.toLowerCase()) {
      return { status: true, error: 'No approval required.' };
    }

    const rpcProvider = new ethers.providers.JsonRpcProvider(CHAINS[provider].rpcUrl);
    const contract = new ethers.Contract(tokenAddress, erc20AllowanceAbi, rpcProvider);
    const allowance = await contract.allowance(walletAddress, limitOrderProtocol);
    if (ethers.BigNumber.from(allowance).gte(amountBN)) {
      return { status: true, alreadyApproved: true };
    }

    const iface = new ethers.utils.Interface(erc20AllowanceAbi);
    const data = iface.encodeFunctionData('approve', [
      limitOrderProtocol,
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
    } catch (error) {
      console.info('[ensureFusionAllowance] Gas estimation failed:', error);
      if (error.message?.includes('Insufficient funds')) throw error;
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
    await rpcProvider.waitForTransaction(txHash, 2, 60_000);
    return { status: true, txHash };
  } catch (error) {
    console.error('[ensureFusionAllowance] Error:', error);
    return { status: false, txHash: null, error };
  }
}
