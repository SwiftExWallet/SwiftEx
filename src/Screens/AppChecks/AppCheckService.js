import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import { REACT_APP_HOST } from "../../Dashboard/exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import { isUpdateRequired } from "./appVersionUtils";

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
    perps: "Perps",
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

const STATUS_FETCH_TIMEOUT_MS = 8000;
const STATUS_REUSE_MAX_AGE_MS = 60 * 1000;
const NAVIGATION_GRACE_MS = 800;

let statusInFlight = null;
let lastFreshStatus = null;

const fetchAppStatus = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(`${REACT_APP_HOST}/v1/app-available`, {
            method: "GET",
            headers: { "Content-Type": "application/json", },
            signal: controller.signal,
        });
        if (!response.ok) {
            return {
                status: false,
                error: `HTTP error: ${response.status}`,
            };
        }
        const result = await response.json();
        if (result) {
            await AsyncStorage.setItem("AppStatusChecks", JSON.stringify(result));
            lastFreshStatus = { result, at: Date.now() };
        }
        return result;
    } catch (error) {
        console.error("CheckAppAvailable error:", error);
        return {
            status: false,
            error: error?.message || "Something went wrong",
        };
    } finally {
        clearTimeout(timer);
    }
};

export const CheckAppAvailable = ({ maxAgeMs = 0 } = {}) => {
    if (maxAgeMs > 0 && lastFreshStatus && Date.now() - lastFreshStatus.at <= maxAgeMs) {
        return Promise.resolve(lastFreshStatus.result);
    }
    if (!statusInFlight) {
        statusInFlight = fetchAppStatus().finally(() => { statusInFlight = null; });
    }
    return statusInFlight;
};

export const getUpdateInfo = (appStatus) => {
    const platform = Platform.OS === "ios" ? "ios" : "android";
    const currentVersion = DeviceInfo.getVersion();
    const latestVersion = appStatus?.appVersion?.[platform]?.latestVersion;

    if (!isUpdateRequired(currentVersion, latestVersion)) {
        return null;
    }

    return {
        currentVersion,
        latestVersion,
        platform,
    };
};

const hasPersistedUser = user => {
    return Boolean(user && user !== "null" && user !== "undefined");
};

export const runBiometricStartup = async ({
    inFlightRef,
    verifyDevice,
    onAuthenticated,
}) => {
    if (inFlightRef.current) return false;

    inFlightRef.current = true;
    let completed = false;
    try {
        const biometric = await AsyncStorage.getItem("Biometric");
        if (biometric !== "SET") return false;

        const authenticated = await verifyDevice();
        if (!authenticated) return false;

        await onAuthenticated();
        completed = true;
        return true;
    } finally {
        if (!completed) inFlightRef.current = false;
    }
};

const isMaintenance = response =>
    response?.maintenance === true || response?.maintenance === "true";

const routeForStatus = (response, destination) => {
    const updateInfo = getUpdateInfo(response);
    if (updateInfo) return ["AppCheck", { info: 2, updateInfo }];
    if (response?.isRestricted || isMaintenance(response)) {
        return ["AppCheck", { info: response?.isRestricted ? 0 : 1, }];
    }
    return [destination];
};

const isBlockingRoute = route => route[0] === "AppCheck";

const PENDING = Symbol("pending");
const wait = ms => new Promise(resolve => setTimeout(() => resolve(PENDING), ms));

export const AppNavigation = async (props) => {
    let destination = "Welcome";
    try {
        const freshPromise = CheckAppAvailable({ maxAgeMs: STATUS_REUSE_MAX_AGE_MS });
        const [storedStatus, user] = await Promise.all([
            AsyncStorage.getItem("AppStatusChecks"),
            AsyncStorage.getItem("user"),
        ]);
        destination = hasPersistedUser(user) ? "HomeScreen" : "Welcome";
        const persistedResponse = storedStatus ? JSON.parse(storedStatus) : null;

        const early = await Promise.race([freshPromise, wait(NAVIGATION_GRACE_MS)]);
        if (early !== PENDING || !persistedResponse) {
            const freshStatus = early !== PENDING ? early : await freshPromise;
            const response = freshStatus?.appVersion ? freshStatus : persistedResponse;
            props.navigation.navigate(...routeForStatus(response, destination));
            return;
        }

        const cachedRoute = routeForStatus(persistedResponse, destination);
        props.navigation.navigate(...cachedRoute);
        if (isBlockingRoute(cachedRoute)) return;
        freshPromise.then(freshStatus => {
            if (!freshStatus?.appVersion) return;
            const lateRoute = routeForStatus(freshStatus, destination);
            if (isBlockingRoute(lateRoute)) props.navigation.navigate(...lateRoute);
        }).catch(error => console.error("AppNavigation late status error:", error));
    } catch (error) {
        console.error("AppNavigation error:", error);
        props.navigation.navigate(destination);
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
