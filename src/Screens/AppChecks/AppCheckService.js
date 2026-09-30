import AsyncStorage from "@react-native-async-storage/async-storage";
import { REACT_APP_HOST } from "../../Dashboard/exchange/crypto-exchange-front-end-main/src/ExchangeConstants";

export const SERVICE_SCREEN_MAP = {
    home: "Home",
    exchange_home: "ExchangeHome",
    exchange: "exchange",
    offers: "Offers",
    transactions: "Transactions",
    classic: "classic",
    stellar_offers: "StellarOffers",
    stellar_transactions: "StellarTransactions",
    stellar_transaction_viewer: "StellarTransactionViewer",
    send_receive: "send_recive",
    assets_manage: "Assets_manage",
    new_offer: "newOffer_modal",
    eth_swap: "EthSwap",
    bnb_swap: "BnbSwap",
    bridge_assets: "BridgeAssets",
    export_usdc: "ExportUSDC",
    token_send: "TokenSend",
    wallet: "Wallet",
    my_wallet: "MyWallet",
    all_wallets: "AllWallets",
    token: "Token",
    nfts: "Nfts",
    send: "Send",
    send_xlm: "SendXLM",
    confirm_transaction: "Confirm Tx",
    transaction_detail: "TxDetail",
    transaction_details: "TxDetails",
    asset_info: "Asset_info",
    coin_details: "CoinDetails",
    tokens_management: "TokensManagement",
    wallet_network_selection: "WalletNetworkSelection",
    discover: "Discover",
    buy_crypto: "buycrypto",
    ramp_provider: "RampProvider",
    banxa_ramp_provider: "BanxaRampProvider",
    payment: "Payment",
    payout: "payout",
    on_off_ramp: "On/Off Ramp",
    kyc: "KycComponent",
    settings: "Settings",
    biometric: "Biometric",
    welcome: "Welcome",
};

export const CheckAppAvailable = async () => {
    try {
        const response = await fetch(`${REACT_APP_HOST}/v1/app-available`, { method: "GET", headers: { "Content-Type": "application/json", }, });
        if (!response.ok) {
            return {
                status: false,
                error: `HTTP error: ${response.status}`,
            };
        }
        const result = await response.json();
        if (result) {
            await AsyncStorage.setItem("AppStatusChecks", JSON.stringify(result));
        }
        return result;
    } catch (error) {
        console.error("CheckAppAvailable error:", error);
        return {
            status: false,
            error: error?.message || "Something went wrong",
        };
    }
};

export const AppNavigation = async (props, user = null) => {
    try {
        const storedStatus = await AsyncStorage.getItem("AppStatusChecks");
        if (!storedStatus) {
            props.navigation.navigate(
                user ? "HomeScreen" : "Welcome"
            );
            return;
        }
        const response = JSON.parse(storedStatus);
        if (response?.isRestricted || response?.maintenance === true || response?.maintenance === "true") {
            props.navigation.navigate("AppCheck", { info: response?.isRestricted ? 0 : 1, });
            return;
        }
        props.navigation.navigate(user ? "HomeScreen" : "Welcome");
    } catch (error) {
        console.error("AppNavigation error:", error);
        props.navigation.navigate(user ? "HomeScreen" : "Welcome");
    }
};

export const getServiceStatusForScreen = (screenName, appStatus) => {
    if (!screenName || !appStatus || !Array.isArray(appStatus.services)) {
        return null;
    }

    const serviceId = Object.keys(SERVICE_SCREEN_MAP).find(id => SERVICE_SCREEN_MAP[id] === screenName);
    if (!serviceId) {
        return null;
    }

    const normalizeId = value => String(value || "").trim().toLowerCase().replace(/-/g, "_");
    const service = appStatus.services.find(item => normalizeId(item.id) === normalizeId(serviceId));
    if (!service) {
        return null;
    }

    const ISSUE_STATUSES = [
        "down",
        "maintenance",
        "degraded",
        "overload",
        "high_traffic",
        "partial_outage",
        "investigating",
        "identified",
        "monitoring",
        "unknown",
    ];

    const status = String(service.status || "")
        .trim()
        .toLowerCase();

    if (ISSUE_STATUSES.includes(status)) {
        return {
            ...service,
            status,
        };
    }
    return null;
};