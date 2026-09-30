import { PPOST, proxyRequest } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/api';

const { ethers } = require('ethers');
const FACTORY_ABI = require('./abi/factory.json');
const QUOTER_ABI = require('./abi/quoter.json');
const SWAP_ROUTER_ABI = require('./abi/swaprouter.json');
const POOL_ABI = require('./abi/pool.json');
const USDC_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)"
];

// Contract Addresses
const ADDRESSES = {
    POOL_FACTORY: '0x5C69bEe701ef814a2B6a3EDD4B65B2d6b5dC217F',
    QUOTER: '0xb27308f9F90D607463bb33eA1Be4eD2508b5b3A9',
    SWAP_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
};

class SwapResult {
    constructor(success, message, data = null, error = null) {
        this.success = success;
        this.message = message;
        this.data = data;
        this.error = error;
    }
}


const WETH_ABI = [
    "function deposit() external payable",
    "function withdraw(uint amount) external",
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)"
];

    
    export async function swapUSDCtoWETH( privateKey, amount, type ,fees) {
        const wallet = new ethers.Wallet(privateKey);
        const address = await wallet.getAddress();
    
        const isEthToUsdc = type === 'EthToUsdc';
        const isUsdcToWeth = type === 'UsdcToWeth';
    
        const ethAmount = ethers.utils.parseEther(amount.toString());
        const usdcAmount = ethers.utils.parseUnits(amount.toString(), 6);
    
        // Interface setup
        const wethIface = new ethers.utils.Interface(WETH_ABI);
        const usdcIface = new ethers.utils.Interface(USDC_ABI);
        const swapIface = new ethers.utils.Interface(SWAP_ROUTER_ABI);
    
        // Construct parameters
        const params = {
            tokenIn: isEthToUsdc ? ADDRESSES.WETH : ADDRESSES.USDC,
            tokenOut: isEthToUsdc ? ADDRESSES.USDC : ADDRESSES.WETH,
            fee: fees,
            recipient: address,
            deadline: Math.floor(Date.now() / 1000) + 600,
            amountIn: isEthToUsdc ? ethAmount : usdcAmount,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        };
    
        // Encode
        const swapData = swapIface.encodeFunctionData("exactInputSingle", [params]);
    
        const payload = {
            address: address,
            swapType:type,
            swapData,
            value: isEthToUsdc ? ethers.utils.formatEther(ethAmount) : ethers.utils.formatEther(usdcAmount)
        };
    
        if (isEthToUsdc) {
            payload.depositData = wethIface.encodeFunctionData("deposit");
            payload.approveData = wethIface.encodeFunctionData("approve", [ADDRESSES.SWAP_ROUTER, ethAmount]);
        } else if (isUsdcToWeth) {
            payload.approveData = usdcIface.encodeFunctionData("approve", [ADDRESSES.SWAP_ROUTER, usdcAmount]);
        }
    
        // Send to backend
          const respo = await proxyRequest("/v1/eth/swap-transaction/prepare", PPOST,  payload);
          console.log("swap-pre---",respo)
          if(respo.err?.status)
            {
                return new SwapResult(
                    false,
                    'Swap failed',
                    null,
                    {
                        message: respo.err.message||"swap Faild",
                        code: false
                    }
                );
            }
            
            const signedTxs = await Promise.all(
                respo.res.map(tx => {
                    if (tx.value) {
                        tx.value = ethers.utils.parseEther(tx.value.toString()).toString();
                      }
                      return wallet.signTransaction(tx);
                })
            );
            console.log(signedTxs)
    
        const { res, err } = await proxyRequest("/v1/eth/swap-transaction/execute", PPOST,  {txs:signedTxs, broadcastChain: "ETH"});
        console.log("swap-exe---",res,err)
        if(err?.status)
        {
            return new SwapResult(
                false,
                'Swap failed',
                null,
                {
                    message: err.message||"swap Faild",
                    code: false
                }
            );
        }
        if(res?.[0]?.status===1)
            {
                return new SwapResult(
                    true,
                    'Swap completed successfully',
                    {                  
                        explorerLink: `https://sepolia.etherscan.io/tx/${res?.[0]?.transactionHash}`
                    }
                );
            }    

        
    }

module.exports = {
    swapUSDCtoWETH,
};