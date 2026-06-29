const { ERC20_ABI } = require("./MultiChainABIS");
const { ethers } = require("ethers");
const { RPC, ETHRPC1, ETHRPC0, POL, ARB, OPT, AVAX, BASE } = require("../../../../../constants");
const { proxyRequest, PGET, PPOST } = require("../../api");
const { CHAINS } = require("../../../../../../utilities/TokenUtils");

const RPC_ENDPOINTS = {
    ETH: [
        RPC.ETHRPC,
        ETHRPC0,
        ETHRPC1,
    ],
    BSC: [
        RPC.BSCRPC,
        RPC.BSCRPC,
        RPC.BSCRPC,
    ],
    BNB: [
        RPC.BSCRPC,
        RPC.BSCRPC,
        RPC.BSCRPC,
    ],
    POL:[
        POL.RPC
    ],
    ARB:[
        ARB.RPC
    ],
    OPT:[
        OPT.RPC
    ],
    AVAX:[
        AVAX.RPC
    ],
    BASE:[
        BASE.RPC
    ],
    BAS:[
        BASE.RPC
    ],
    AVA:[
        AVAX.RPC
    ],
};

async function handleRPCFallBack(network, type, params) {
    console.debug(`All RPCs failed for [${network}]. now use Fallback.`);

    if (network === "ETH" && type === "walletBalance") {
        const { res, err } = await proxyRequest(`/v1/eth/${params.address}/balance`, PGET);
        if (err) throw new Error(`handleRPCFallBack failed`);
        const balance = ethers.utils.formatEther(res);
        return {
            status: true,
            network,
            address: params.address,
            balance,
            fromBackend: true
        };
    }

    if (network === "ETH" && type === "tokenBalances") {
        const { res, err } = await proxyRequest(`/v1/eth/token/info`, PPOST, {
            "addresses": params.tokenAddresses,
            "walletAddress": params.walletAddress
        });
        if (err) throw new Error(`handleRPCFallBack failed`);

        return {
            status: true,
            fromBackend: true,
            tokenInfo: res.map(token => ({
                name: token.name,
                symbol: token.symbol,
                balance: token.balance,
                address: token.address,
                imageUrl: token.imageUrl ?? "",
                decimals: token.decimals,
                walletBalance: params.walletBalance ?? "0",
                tokenBalance: token.balance
            }))
        };
    }

    throw new Error(`Unsupported network or type: ${network} / ${type}`);
}

async function withRpcFallback(network, operation) {
    const endpoints = RPC_ENDPOINTS[network];
    if (!endpoints?.length) throw new Error(`Unsupported network: ${network}`);

    let lastError;

    for (let attempt = 0; attempt < endpoints.length; attempt++) {
        const url = endpoints[attempt];
        const provider = new ethers.providers.JsonRpcProvider(url);
        console.debug(`RPC attempt ${attempt + 1}/${endpoints.length} [${network}]: ${url}`);
        try {
            return await operation(provider);
        } catch (err) {
            lastError = err;
            console.debug(
                `RPC attempt ${attempt + 1} failed [${network}]: ${err.message}. Trying next...`
            );
        }
    }

    throw lastError || new Error(`All RPC endpoints failed for network: ${network}`);
}

async function getWalletBalance(address, network) {
    try {
        const result = await withRpcFallback(network, async (provider) => {
            const balance = await provider.getBalance(address);
            return ethers.utils.formatEther(balance);
        });

        console.log(`${network} Address: ${address}`);
        console.log(`${network} Balance: ${result} ${network}`);

        return { status: true, network, address, balance: result };

    } catch (err) {
        console.debug(`All RPCs failed for getWalletBalance [${network}]:`, err.message);

        try {
            return await handleRPCFallBack(network, "walletBalance", { address });
        } catch (fallbackErr) {
            console.error(`Backend fallback also failed:`, fallbackErr.message);
            return { status: false, network, address, balance: 0 };
        }
    }
}

async function getTokenBalancesUsingAddress(tokenAddresses, walletAddress, typeNetwork) {
    let walletBalance = "0";
    const network=typeNetwork.toUpperCase();
    try {
        if (!RPC_ENDPOINTS[network]) throw new Error(`Unsupported network: ${network}`);

        walletBalance = await withRpcFallback(network, async (provider) => {
            const raw = await provider.getBalance(walletAddress);
            return ethers.utils.formatEther(raw);
        });

        const tokens = Array.isArray(tokenAddresses) ? tokenAddresses : [tokenAddresses];
        const results = [];


        for (const tokenAddress of tokens) {
            try {
                const isNative =
                    tokenAddress.toLowerCase() === "0x0000000000000000000000000000000000000000";

                if (isNative) {
                    const nativeInfo = CHAINS[network];
                    results.push({
                        name: nativeInfo.name,
                        symbol: nativeInfo.symbol,
                        balance: walletBalance,
                        address: tokenAddress,
                        imageUrl: "",
                        decimals: "18",
                        walletBalance,
                        tokenBalance: walletBalance
                    });
                } else {
                    const [rawBalance, decimals, symbol, name] = await withRpcFallback(
                        network,
                        async (provider) => {
                            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
                            return Promise.all([
                                tokenContract.balanceOf(walletAddress),
                                tokenContract.decimals(),
                                tokenContract.symbol(),
                                tokenContract.name()
                            ]);
                        }
                    );

                    const tokenBalance = ethers.utils.formatUnits(rawBalance, decimals);
                    results.push({
                        name, symbol,
                        balance: tokenBalance,
                        address: tokenAddress,
                        imageUrl: "",
                        decimals: decimals.toString(),
                        walletBalance,
                        tokenBalance
                    });
                }
            } catch (tokenErr) {
                console.error(`Error fetching token ${tokenAddress} on ${network}:`, tokenErr.message);
                results.push({
                    name: "", symbol: "", balance: "0",
                    address: tokenAddress, imageUrl: "",
                    decimals: "0", walletBalance, tokenBalance: "0"
                });
            }
        }

        return { status: true, tokenInfo: results };

    } catch (err) {
        console.error(`All RPCs failed for getTokenBalancesUsingAddress [${network}]:`, err.message);

        try {
            return await handleRPCFallBack(network, "tokenBalances", {
                tokenAddresses,
                walletAddress,
                walletBalance
            });
        } catch (fallbackErr) {
            console.error(`Backend fallback also failed:`, fallbackErr.message);
            return { status: false, tokenInfo: [] };
        }
    }
}

module.exports = { getWalletBalance, getTokenBalancesUsingAddress };