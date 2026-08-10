const { CHAINS } = require("../../../../../../utilities/TokenUtils");
const store = require("../../../../../../components/Redux/Store").default;

const NETWORK_ALIAS = {
    ETH: "ETH",
    BSC: "BSC",
    BNB: "BSC",
    POL: "POL",
    ARB: "ARB",
    OPT: "OPT",
    AVAX: "AVAX",
    AVA: "AVAX",
    BASE: "BASE",
    BAS: "BASE",
};

function getPortfolioTokens() {
    const state = store.getState();
    return Array.isArray(state.activeWalletPortFolio) ? state.activeWalletPortFolio : [];
}

async function getWalletBalance(address, network) {
    try {
        const normalizedNetwork = NETWORK_ALIAS[network?.toUpperCase()] || network;
        const tokens = getPortfolioTokens();
        const nativeToken = tokens.find(
            (t) => t.chain === normalizedNetwork && t.contractAddress === "Native"
        );

        if (!nativeToken) {
            return { status: false, network, address, balance: 0 };
        }

        return {
            status: true,
            network,
            address,
            balance: nativeToken.balance.toString(),
            fromPortfolioState: true,
        };
    } catch (err) {
        console.error(`getWalletBalance (portfolio-state) failed [${network}]:`, err.message);
        return { status: false, network, address, balance: 0 };
    }
}

function getSingleTokenInfo(tokenAddress, walletAddress, network, walletBalance) {
    const isNative = tokenAddress.toLowerCase() === "0x0000000000000000000000000000000000000000";

    if (isNative) {
        const nativeInfo = CHAINS[network];
        return {
            name: nativeInfo?.name || network,
            symbol: nativeInfo?.symbol || network,
            balance: walletBalance,
            address: tokenAddress,
            imageUrl: "",
            decimals: "18",
            walletBalance,
            tokenBalance: walletBalance
        };
    }

    const tokens = getPortfolioTokens();
    const matched = tokens.find(
        (t) => t.chain === network && t.contractAddress?.toLowerCase() === tokenAddress.toLowerCase()
    );

    if (!matched) {
        return {
            name: "", symbol: "", balance: "0",
            address: tokenAddress, imageUrl: "",
            decimals: "0", walletBalance, tokenBalance: "0"
        };
    }

    return {
        name: matched.name,
        symbol: matched.symbol,
        balance: matched.balance.toString(),
        address: tokenAddress,
        imageUrl: matched.imageUrl || "",
        decimals: matched.decimals.toString(),
        walletBalance,
        tokenBalance: matched.balance.toString()
    };
}

async function getTokenBalancesUsingAddress(tokenAddresses, walletAddress, typeNetwork) {
    const network = NETWORK_ALIAS[typeNetwork?.toUpperCase()] || typeNetwork.toUpperCase();

    try {
        const nativeResult = await getWalletBalance(walletAddress, network);
        const walletBalance = nativeResult.status ? nativeResult.balance : "0";

        const tokens = Array.isArray(tokenAddresses) ? tokenAddresses : [tokenAddresses];
        const results = tokens.map((tokenAddress) =>
            getSingleTokenInfo(tokenAddress, walletAddress, network, walletBalance)
        );

        return { status: true, tokenInfo: results };
    } catch (err) {
        console.error(`getTokenBalancesUsingAddress (portfolio-state) failed [${network}]:`, err.message);
        return { status: false, tokenInfo: [] };
    }
}

module.exports = { getWalletBalance, getTokenBalancesUsingAddress };