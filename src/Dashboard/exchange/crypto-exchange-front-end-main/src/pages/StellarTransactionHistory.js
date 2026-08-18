import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from "react-native";
import * as StellarSdk from "@stellar/stellar-sdk";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { NEARINTENT, STELLAR_URL } from "../../../../constants";
import { useNavigation } from "@react-navigation/native";
import { authRequest, POST } from "../api";
import AllbridgeTxTrack from "../components/AllbridgeTxTrack";
import LocalTxManager from "../../../../../utilities/LocalTxManager";
import { useSelector } from "react-redux";
import { AllbridgeCoreSdk, nodeRpcUrlsDefault } from "@allbridge/bridge-core-sdk";
import CustomInfoProvider from "../components/CustomInfoProvider";
import { colors } from "../../../../../Screens/ThemeColorsConfig";
import { configure, GetNearIntentStatus } from "../../../../../nearIntent/nearIntentUtil";

const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
const PAGE_SIZE = 10;
const INITIAL_LOAD = 10;
const STELLAR_BATCH_SIZE = 30;

const getThemeColors = (isDarkMode) => ({
  background: isDarkMode ? colors.dark.bg : colors.light.bg,
  cardBackground: isDarkMode ? colors.dark.cardBg : colors.light.cardBg,
  primaryText: isDarkMode ? "#FFFFFF" : "#333333",
  secondaryText: isDarkMode ? "#B0B0B0" : "#666666",
  tabBarBackground: isDarkMode ? colors.dark.cardBg : colors.light.cardBg,
  iconBackground: isDarkMode ? colors.dark.bg : colors.light.bg,
  divider: isDarkMode ? "#2D2D2D" : "#E0E0E0",
  shadow: isDarkMode ? "#000000" : "#000000",
  accent: "#4052D6",
  success: "#1D5F33",
  error: "#F44336",
  sent: "#FF5722",
  received: "#4CAF50",
  // semantic tint pairs: {bg, fg} for icon containers / status text, per category
  tint: {
    success: { bg: isDarkMode ? "#123321" : "#E4F3E9", fg: isDarkMode ? "#7ED9A0" : "#1D5F33" },
    warning: { bg: isDarkMode ? "#3A2E10" : "#FBF0DD", fg: isDarkMode ? "#F2C579" : "#8A5A0B" },
    danger: { bg: isDarkMode ? "#3A1414" : "#FCEBEB", fg: isDarkMode ? "#F09595" : "#A32D2D" },
    accent: { bg: isDarkMode ? "#101C33" : "#E6F1FB", fg: isDarkMode ? "#85B7EB" : "#185FA5" },
    pro: { bg: isDarkMode ? "#241B33" : "#EEEDFE", fg: isDarkMode ? "#AFA9EC" : "#534AB7" },
    neutral: { bg: isDarkMode ? "#232323" : "#F1EFE8", fg: isDarkMode ? "#B0B0B0" : "#5F5E5A" },
  },
});

function formatDate(dateString) {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

const getAssetName = (code, type) => {
  if (type === "native") return "XLM";
  return code || "XLM";
};

const chainMap = {
  1: "Ethereum",
  2: "BNB",
  3: "Polygon",
  4: "Avalanche",
  5: "Solana",
  6: "Arbitrum",
  7: "Stellar",
};

// Known NEAR-Intents (1Click) deposit addresses on Stellar. Jab bhi user
// koi plain `payment` in me se kisi address ko bhejta hai, ye actually
// NEAR Intents ke through ek withdrawal/cross-chain-swap hoti hai — NEAR
// Intents Stellar par koi Soroban contract-call nahi karta, sirf plain
// payment + memo hota hai (isliye ye purely address-based detection hai,
// function-name se decode nahi ho sakta jaisa Aquarius/Allbridge ke liye
// karte hain).
// TODO: Ye list backend/config se dynamically aani chahiye (NEAR Intents
// Explorer API se verify karke — jaisa humne discuss kiya tha), kyunki
// deposit addresses NEAR Intents side se rotate/change ho sakte hain.
// Abhi ke liye ek known address hardcode kiya hai.
const NEAR_INTENT_DEPOSIT_ADDRESSES = new Set([
  "GDJ4JZXZELZD737NVFORH4PSSQDWFDZTKW3AIDKHYQG23ZXBPDGGQBJK",
]);

const isNearIntentWithdrawal = (operation) =>
  operation.type === "payment" && NEAR_INTENT_DEPOSIT_ADDRESSES.has(operation.to);

// Icon per destination chain, falls back to a generic link icon for unknown IDs.
const chainIconMap = {
  Ethereum: "ethereum",
  BNB: "currency-bnb",
  Polygon: "hexagon-outline",
  Avalanche: "triangle-outline",
  Solana: "alpha-s-circle-outline",
  Arbitrum: "hexagram-outline",
  Stellar: "star-four-points-outline",
};

const decodeDestinationChain = (params = []) => {
  try {
    const chainParam = params.find((p) => p.type === "U32");
    if (!chainParam?.value) return null;

    const bytes = Buffer.from(chainParam.value, "base64");
    let chainId = 0;
    for (let i = bytes.length - 4; i < bytes.length; i++) {
      chainId = (chainId << 8) + bytes[i];
    }
    return chainMap[chainId] || null;
  } catch {
    return null;
  }
};

// Decodes the Soroban contract method name out of the operation's `parameters`
// array. Horizon's own `function` field is just the op-kind constant
// (HostFunctionTypeHostFunctionTypeInvokeContract) — never the method name —
// so the method itself has to be read from the first `Sym`-typed parameter.
const getContractFunctionName = (params = []) => {
  try {
    const symParam = params.find((p) => p.type === "Sym");
    if (!symParam?.value) return null;
    return Buffer.from(symParam.value, "base64")
      .toString("utf-8")
      // strip the SCVal type-tag bytes that precede the ascii symbol name
      .replace(/[^\x20-\x7E]/g, "");
  } catch {
    return null;
  }
};

// Function names that are uniquely used by Aquarius's router/pool contracts.
// Used purely for a friendly "via Aquarius" label — does not affect
// bridge/swap/transfer classification.
// NOTE (fix): "deposit"/"withdraw"/"claim" ko yahan pehle include kiya
// gaya tha, lekin ye generic bridge function-names hain — Allbridge (aur
// baaki bridges) bhi bilkul yehi naam use karte hain (isi file me upar
// `UNAMBIGUOUS_BRIDGE_FUNCTIONS = ['deposit', 'withdraw', 'claim_balance']`
// isko already confirm karta hai). Sirf "swap_chained" hi genuinely,
// verifiably Aquarius-specific hai (multi-hop router pattern, jo humne
// actual on-chain trace se confirm kiya tha). Baaki naam yahan rakhna
// false-positive "via Aquarius" label deta hai kisi bhi generic
// deposit/withdraw-based bridge tx par (jaisa is bug me hua).
const AQUARIUS_FUNCTIONS = ["swap_chained"];

const getContractProvider = (fnName = "", subtype = null) => {
  // Sirf genuine SWAP operations par hi provider-label dikhao — bridge
  // operations (jinke function names generic hote hain, alag protocols
  // shared karte hain) par kabhi nahi.
  if (subtype && subtype !== "swap") return null;
  const name = (fnName || "").toLowerCase();
  if (AQUARIUS_FUNCTIONS.includes(name)) return "Aquarius";
  return null;
};

const UNAMBIGUOUS_BRIDGE_FUNCTIONS = ["deposit", "withdraw", "claim_balance"];

// Classifies an invoke_host_function call into one of three user-facing
// buckets so the UI never has to guess from the generic op type alone.
// `swap_chained` (and similarly-named functions) is shared by Allbridge's
// real cross-chain bridge AND its same-chain multi-hop DEX swap — the
// function name alone can't tell them apart. The destination-chain
// parameter is the actual signal: present = genuinely crossing chains,
// absent = the swap starts and ends on Stellar.
const getInvokeHostFunctionSubtype = (fnName = "", assetBalanceChanges = [], hasDestinationChain = false) => {
  const name = (fnName || "").toLowerCase();

  if (UNAMBIGUOUS_BRIDGE_FUNCTIONS.includes(name)) return "bridge";

  if (name.includes("swap") || name.includes("liquidity")) {
    return hasDestinationChain ? "bridge" : "swap";
  }

  const changeType = assetBalanceChanges?.[0]?.type;
  if (name === "transfer" || ["transfer", "mint", "burn", "clawback"].includes(changeType)) {
    return "transfer";
  }

  // Unknown contract call — fall back on whether a destination chain was
  // actually decoded rather than assuming bridge by default.
  return hasDestinationChain ? "bridge" : "transfer";
};

const getTransactionType = (operation, userPublicKey, isReceived) => {
  if (operation.type === "payment") {
    if (isNearIntentWithdrawal(operation)) {
      return "Withdrawal";
    }
    if (operation.asset_type === "native") return "XLM";
    return operation.asset_code || "XLM";
  }

  switch (operation.type) {
    case "create_account":
      return "Account Created";
    case "change_trust":
      return "Trust Line";
    case "manage_sell_offer":
      return "Swap Out";
    case "manage_buy_offer":
      return "Swap In";
    case "invoke_host_function": {
      const subtype = operation.contractSubtype || "bridge";
      if (subtype === "swap") {
        const fromAsset = operation.swapFromCode || "Unknown";
        const toAsset = operation.swapToCode || "Unknown";
        return `${fromAsset} -> ${toAsset}`;
      }
      if (subtype === "transfer") {
        return isReceived ? "Received" : "Sent";
      }
      return isReceived
        ? `Deposit ${operation.destinationChain || "Bridge"}`
        : `Withdraw ${operation.destinationChain || "Bridge"}`;
    }
    case "path_payment_strict_send":
    case "path_payment_strict_receive": {
      const fromAsset = getAssetName(operation.source_asset_code, operation.source_asset_type);
      const toAsset = getAssetName(operation.asset_code, operation.asset_type);
      return `${fromAsset} -> ${toAsset}`;
    }
    case "setOptions":
      return "Settings Update";
    case "buyCry":
      return `Buy ${operation?.cryptoName || ""}`;
    case "sellCry":
      return `Sell ${operation?.cryptoName || ""}`;
    case "create_claimable_balance":
      return `${operation?.asset?.split(":")[0] || "Claimable Asset"}`;
    case "wallet_tx":
      if (operation.txType === "nearIntent") {
        return `NEAR Intent ${operation.symbol || ""}`.trim();
      }
      if (operation.chain === "SRB") {
        return `Withdraw ${operation.symbol || "USDC"}`;
      }
      return `Deposit ${operation.symbol || "USDC"}`;
    default:
      return operation.type.replace(/([A-Z])/g, " $1").trim();
  }
};

const getTransactionIcon = (operation) => {
  switch (operation.type) {
    case "payment":
      return "cash-multiple";
    case "create_account":
      return "account-plus";
    case "change_trust":
      return "shield-check";
    case "manage_sell_offer":
      return "trending-down";
    case "manage_buy_offer":
      return "trending-up";
    case "path_payment_strict_send":
    case "path_payment_strict_receive":
      return "swap-vertical";
    case "invoke_host_function": {
      const subtype = operation.contractSubtype || "bridge";
      if (subtype === "swap") return "swap-horizontal";
      if (subtype === "transfer") return "cash-multiple";
      return "bridge";
    }
    case "setOptions":
      return "cog";
    case "sellCry":
      return "bank-transfer-in";
    case "buyCry":
      return "cash-fast";
    case "create_claimable_balance":
      return "clock-outline";
    case "wallet_tx":
      return operation.txType === "nearIntent" ? "chart-bubble" : "bridge";
    default:
      return "bank-transfer";
  }
};

// Maps an operation to a semantic tint bucket in theme.tint so colors carry
// meaning consistently (success/warning/danger/accent/pro/neutral) instead
// of being assigned type-by-type ad hoc.
const getCardTint = (operation, item, isReceived) => {
  if (item.success === false || ["failed", "Failed", "FAILED"].includes(item.success)) {
    return "danger";
  }
  if (["pending", "processing", "process"].includes(item.success)) {
    return "warning";
  }

  switch (operation.type) {
    case "payment":
      if (isNearIntentWithdrawal(operation)) return "accent";
      return isReceived ? "success" : "neutral";
    case "create_account":
      return "success";
    case "path_payment_strict_send":
    case "path_payment_strict_receive":
      return "pro";
    case "manage_sell_offer":
    case "manage_buy_offer":
      return "warning";
    case "buyCry":
      return "success";
    case "create_claimable_balance":
      return "pro";
    case "invoke_host_function": {
      const subtype = operation.contractSubtype || "bridge";
      if (subtype === "swap") return "pro";
      if (subtype === "transfer") return isReceived ? "success" : "neutral";
      return "accent";
    }
    case "wallet_tx":
      return operation.txType === "nearIntent" ? "accent" : "accent";
    default:
      return "neutral";
  }
};

const BRIDGE_STEPS = ["sent", "bridging", "received"];

// NOTE (fix): pehle "completed"/"success"/"claimable"/true sab 2 return
// karte the — jo labels array (Sent/Bridging/Received) ke LAST index (2)
// ke barabar hai. Render logic me `i === stepIndex` ko "abhi in-progress"
// (orange ring) treat kiya jaata hai, `i < stepIndex` ko hi green-check
// milta hai. Isliye jab transaction genuinely poori complete ho jaati thi,
// "Received" step (index 2) hamesha orange/in-progress hi dikhta rehta
// tha, kabhi green-check nahi hota — off-by-one bug. Fix: fully-complete
// states ab 3 return karte hain (last-index se ek aage), taaki `i < 3`
// teeno steps (0,1,2) ke liye true ho aur sab green-check ho jayein.
const getBridgeStepIndex = (status) => {
  if (status === true) return 3;
  if (status === false) return 0;
  const s = String(status || "").toLowerCase();
  if (["completed", "success", "claimable"].includes(s)) return 3;
  if (["processing", "process", "pending"].includes(s)) return 1;
  return 0;
};

const BridgeProgressSteps = ({ status, colors }) => {
  const stepIndex = getBridgeStepIndex(status);
  const labels = ["Sent", "Bridging", "Received"];

  return (
    <View style={styles.progressRow}>
      {labels.map((label, i) => (
        <React.Fragment key={label}>
          <View style={styles.progressStep}>
            <View
              style={[
                styles.progressDot,
                i < stepIndex && { backgroundColor: colors.tint.success.fg },
                i === stepIndex && {
                  backgroundColor: colors.tint.warning.bg,
                  borderWidth: 2,
                  borderColor: colors.tint.warning.fg,
                },
                i > stepIndex && { backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.divider },
              ]}
            >
              {i < stepIndex && <Icon name="check" size={11} color={colors.background} />}
            </View>
            <Text style={[styles.progressLabel, { color: i <= stepIndex ? colors.secondaryText : colors.divider }]}>
              {label}
            </Text>
          </View>
          {i < labels.length - 1 && (
            <View
              style={[
                styles.progressLine,
                { backgroundColor: i < stepIndex ? colors.tint.success.fg : colors.divider },
              ]}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );
};

const TabBar = ({ selectedTab, onTabPress, isDarkMode }) => {
  const colors = getThemeColors(isDarkMode);
  const tabs = [
    { key: "all", title: "All", icon: "history" },
    { key: "sent", title: "Sent", icon: "arrow-top-right" },
    { key: "received", title: "Received", icon: "arrow-bottom-left" },
    { key: "path", title: "Swaps", icon: "swap-vertical" },
  ];

  return (
    <View style={[styles.tabBar, { backgroundColor: colors.tabBarBackground }]}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tab,
            selectedTab === tab.key && styles.selectedTab,
            selectedTab === tab.key && { borderBottomColor: colors.accent },
          ]}
          onPress={() => onTabPress(tab.key)}
        >
          <Icon
            name={tab.icon}
            size={24}
            color={selectedTab === tab.key ? colors.primaryText : colors.secondaryText}
          />
          <Text
            style={[
              styles.tabText,
              { color: colors.secondaryText },
              selectedTab === tab.key && { color: colors.primaryText },
            ]}
          >
            {tab.title}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const TransactionCard = ({ item, userPublicKey, isDarkMode, onRefreshTx }) => {
  const navigation = useNavigation();
  const colors = getThemeColors(isDarkMode);
  const operations = item?.operations?.records || [];
  const operation =
    operations.find((op) =>
      ["payment", "path_payment_strict_receive", "path_payment_strict_send", "invoke_host_function"].includes(op.type)
    ) || operations[0];

  const txType = operation.asset_balance_changes?.find((resObj) => resObj.to === userPublicKey);
  const isReceived =
    operation?.to === userPublicKey ||
    operation.type === "create_account" ||
    operation.type === "change_trust" ||
    (operation.type === "invoke_host_function" && !!txType);

  const multiTxType = [...new Set(operations.map((op) => getTransactionType(op, userPublicKey, isReceived)))].join(" & ");
  const transactionType = multiTxType;

  const [showTx, setshowTx] = useState(false);
  const [showTxHash, setshowTxHash] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const iconName = getTransactionIcon(operation);
  const tintKey = getCardTint(operation, item, isReceived);
  const tint = colors.tint[tintKey];

  let amountText = "0";
  if (operation.type === "create_claimable_balance") {
    amountText = operation.amount;
  } else if (operation.type === "payment") {
    amountText = operation.amount;
  } else if (operation.type === "create_account") {
    amountText = operation.starting_balance;
  } else if (operation.type === "invoke_host_function") {
    const transfers =
      operation.asset_balance_changes?.filter(
        (resObj) => resObj.type === "transfer" && (resObj.to === userPublicKey || resObj.from === userPublicKey)
      ) || [];
    amountText = transfers.length > 1 ? transfers[1].amount : transfers[0]?.amount || "0";
  } else if (operation.type === "manage_sell_offer" || operation.type === "manage_buy_offer") {
    amountText = operation.amount;
  } else if (operation.type === "buyCry" || operation.type === "sellCry") {
    amountText = operation.amount;
  }

  const isPathPayment =
    operation.type === "path_payment_strict_send" || operation.type === "path_payment_strict_receive";
  const isWalletTx = operation.type === "wallet_tx";
  const isBridgeInvoke = operation.type === "invoke_host_function" && (operation.contractSubtype || "bridge") === "bridge";
  const isSwapInvoke = operation.type === "invoke_host_function" && operation.contractSubtype === "swap";
  const isBridgeLike = isWalletTx && operation.txType !== "nearIntent";
  // Plain `payment` op jo NEAR-Intents ke known deposit-address par jaa
  // raha hai — Horizon ke liye ye ek simple payment hai, lekin actually
  // ek cross-chain withdrawal hai (NEAR Intents Stellar par koi contract-
  // call nahi karta). UI me ise bridge-card jaisa hi treat karte hain.
  const isNearIntentPayment = isNearIntentWithdrawal(operation);
  // Dual-leg amount display applies to path payments, on-chain swaps,
  // Allbridge-style bridge calls, aur NEAR-Intent withdrawals — anywhere
  // a "from" and "to" leg both exist (ya conceptually exist, jaisa
  // NEAR-Intent ke case me — receive-leg dusre chain par hoti hai).
  const isDualAmount = isPathPayment || isSwapInvoke || isBridgeInvoke || isNearIntentPayment;

  let assetFrom = "";
  let assetTo = "";
  let amountFrom = "";
  let amountTo = "";

  if (isPathPayment) {
    assetFrom = operation.source_asset_code || (operation.source_asset_type === "native" ? "XLM" : operation.source_asset_type);
    assetTo = operation.asset_code || (operation.asset_type === "native" ? "XLM" : operation.asset_type);
    amountFrom = operation.source_amount;
    amountTo = operation.amount;
  } else if (isSwapInvoke) {
    assetFrom = operation.swapFromCode || "Unknown";
    assetTo = operation.swapToCode || "Unknown";
    const transfers = operation.asset_balance_changes || [];
    const outLeg = transfers.find((t) => t.from === userPublicKey);
    const inLeg = transfers.find((t) => t.to === userPublicKey);
    amountFrom = outLeg?.amount || operation.amount;
    amountTo = inLeg && inLeg !== outLeg ? inLeg.amount : null;
  } else if (isBridgeInvoke) {
    const transfers = operation.asset_balance_changes || [];
    const outLeg = transfers.find((t) => t.from === userPublicKey);
    const inLeg = transfers.find((t) => t.to === userPublicKey);
    amountFrom = outLeg?.amount || amountText;
    // Only show a "+" leg when a genuinely distinct incoming transfer exists
    // in this same operation. Bridging out to another chain often has only
    // the outgoing leg recorded here — the receive happens on the other
    // chain later — so defaulting amountTo to amountFrom would show a
    // misleading identical -X / +X pair.
    amountTo = inLeg && inLeg !== outLeg ? inLeg.amount : null;
  } else if (isNearIntentPayment) {
    // Plain payment — Horizon ke paas destination-chain wali "+" leg ka
    // koi data hi nahi hai (wo off-chain, NEAR solvers ke through hoti
    // hai). Sirf outgoing leg pakki hai; incoming amount NEAR Intents
    // Explorer API se hi milega (yahan available nahi, isliye null).
    amountFrom = operation.amount || amountText;
    amountTo = null;
  }

  const providerLabel =
    operation.type === "invoke_host_function"
      ? getContractProvider(operation.contractFunctionName, operation.contractSubtype)
      : isNearIntentPayment
      ? "NEAR Intent"
      : null;

  const handleRefreshTx = async () => {
    if (isWalletTx && operation.hash) {
      setIsRefreshing(true);
      await onRefreshTx(operation.chain, operation.hash, operation.txType, operation.depositMemo);
      setIsRefreshing(false);
    }
  };

  const txViewrManager = (txId, txType, received) => {
    if (operation.txType === "nearIntent") {
      Linking.openURL(`${NEARINTENT.EXPLORER}${txId}`);
      return;
    }
    if (txType === "invoke_host_function" && !received) {
      setshowTxHash([{ chain: "SRB", hash: txId }]);
      setshowTx(true);
    } else if (txType === "wallet_tx") {
      setshowTxHash([{ chain: operation.chain, hash: operation.hash }]);
      setshowTx(true);
    } else {
      Linking.openURL(`${STELLAR_URL.EXPERT_URL}/tx/${txId}`);
    }
  };

  const statusLabel = () => {
    if (item.success === true) return operation.type === "create_claimable_balance" ? "Claimable" : "Success";
    if (item.success === "processing") return "Processing";
    if (item.success === "process") return "Process";
    if (["completed", "Completed"].includes(item.success)) return "Success";
    if (item.success === false || ["failed", "Failed", "FAILED"].includes(item.success)) return "Failed";
    if (typeof item.success === "string") return item.success.charAt(0).toUpperCase() + item.success.slice(1);
    return "Unknown";
  };

  const isFailed = item.success === false || ["failed", "Failed", "FAILED"].includes(item.success);

  return (
    <>
      <TouchableOpacity
        style={[styles.transactionCard, { backgroundColor: colors.cardBackground, shadowColor: colors.shadow }]}
        disabled={operation.type === "sellCry" || operation.type === "buyCry" || (isBridgeLike && item.success === "pending" && !isFailed)}
        onPress={() => {
          isFailed
            ? CustomInfoProvider.show("error", "Opps!", "Transaction failed try again.")
            : txViewrManager(
                item?.operations?.records[0]?.transaction_hash || item?.operations?.records[0]?.hash,
                operation.type,
                isReceived
              );
        }}
      >
        <View style={[styles.iconContainer, { backgroundColor: tint.bg }]}>
          {isBridgeInvoke || isNearIntentPayment || (isWalletTx && !isFailed) ? (
            <View style={styles.chainIconStack}>
              <View style={[styles.chainIconBack, { backgroundColor: colors.cardBackground, borderColor: colors.divider }]}>
                <Icon name="bridge" size={29} color={colors.secondaryText} />
              </View>
            </View>
          ) : (
            <Icon
              name={
                isReceived && operation.type === "payment"
                  ? "arrow-bottom-left"
                  : operation.type === "payment"
                  ? "arrow-top-right"
                  : iconName
              }
              size={24}
              color={tint.fg}
            />
          )}
        </View>

        <View style={styles.contentContainer}>
          {isWalletTx ? (
            isFailed ? (
              <View style={styles.transactionHeader}>
                <TouchableOpacity onPress={() => navigation.navigate("ExportUSDC")} style={styles.tryAgainBtn}>
                  <Text style={{ fontSize: 14, color: "#fff" }}>Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.transactionHeader}>
                <TouchableOpacity onPress={handleRefreshTx} disabled={isRefreshing} style={styles.refreshButton}>
                  {isRefreshing ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Icon name="refresh" size={24} color={colors.accent} />
                  )}
                </TouchableOpacity>
              </View>
            )
          ) : (
            !isDualAmount && (
              <View style={styles.transactionHeader}>
                <Text style={[styles.amount, { color: colors.primaryText }]}>
                  {isReceived ||
                  ["manage_sell_offer", "manage_buy_offer", "sellCry", "buyCry", "create_claimable_balance"].includes(
                    operation.type
                  )
                    ? ""
                    : "-"}
                  {operation.type !== "change_trust" && amountText}
                </Text>
              </View>
            )
          )}

          {isDualAmount ? (
            <View>
              <View style={styles.dualAmountRow}>
                <View>
                  <Text style={[styles.type, { color: colors.primaryText, maxWidth: 140 }]}>{transactionType}</Text>
                  <Text style={[styles.date, { color: colors.secondaryText }]}>{item.date}</Text>
                   {providerLabel==="Aquarius" && (
                    <Text style={[styles.providerLabel, { color: colors.tint.pro.fg }]}>via {providerLabel}</Text>
                  )}
                </View>
                <View>
                  {transactionType!=="Deposit Bridge" && (
                  <Text style={[styles.amount, { color: colors.primaryText }]}>-{amountFrom}</Text>
                  )}
                  {amountTo != null && (
                    <Text style={[styles.amount, { color: colors.tint.success.fg }]}>+{amountTo}</Text>
                  )}
                  {providerLabel==="NEAR Intent" && (
                    <Text style={[styles.providerLabel, { color: colors.tint.pro.fg }]}>via {providerLabel}</Text>
                  )}
                </View>
              </View>
              {(isBridgeInvoke || isNearIntentPayment) && !isFailed && (
                <BridgeProgressSteps status={item.success} colors={colors} />
              )}
            </View>
          ) : (
            <View style={styles.transactionDetails}>
              <View style={{ marginTop: -33 }}>
                <Text style={[styles.type, { color: colors.primaryText, maxWidth: 140 }]}>{transactionType}</Text>
                <Text style={[styles.date, { color: colors.secondaryText }]}>{item.date || ""}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: tint.bg }]}>
                <Text style={[styles.statusText, { color: tint.fg }]}>{statusLabel()}</Text>
              </View>
            </View>
          )}

          {item.memo && item.memo !== "No memo" && (
            <Text style={[styles.memo, { color: colors.secondaryText }]} numberOfLines={1}>
              Memo: {item.memo}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.allBridgeTxCon}>
        <AllbridgeTxTrack txs={showTxHash} isDarkMode={true} showTx={showTx} closeTx={() => setshowTx(false)} />
      </View>
    </>
  );
};

const processStellarTx = async (tx, publicKey) => {
  const operations = await tx.operations();
  const firstOp = operations.records[0];
  let amount = "0";
  let isReceived = false;

  if (firstOp.type === "payment") {
    amount = firstOp.amount;
    isReceived = firstOp.to === publicKey;
  } else if (firstOp.type === "create_account") {
    amount = firstOp.starting_balance;
    isReceived = true;
  } else if (firstOp.type === "invoke_host_function") {
    const decodedChain = decodeDestinationChain(firstOp.parameters);
    firstOp.destinationChain = decodedChain; // null when this call never left Stellar

    const fnName = getContractFunctionName(firstOp.parameters);
    firstOp.contractFunctionName = fnName;
    firstOp.contractSubtype = getInvokeHostFunctionSubtype(fnName, firstOp.asset_balance_changes, !!decodedChain);

    if (firstOp.contractSubtype === "swap") {
      // Resolve the actual from/to asset codes for this swap leg pair —
      // these fields don't exist on the raw Horizon record, so without
      // this every swap card silently fell back to "XLM -> XLM".
      //
      // NOTE (fix): Horizon's asset_balance_changes entries use the field
      // name `asset_code` (matching every other place in this file, e.g.
      // path-payment handling below) — this previously read `.code`,
      // which doesn't exist on the object, so it was always undefined and
      // silently fell through to the "Unknown" fallback for every
      // non-native leg. That's why any swap involving a non-XLM asset on
      // both legs (the vast majority of Aquarius multi-hop swaps) rendered
      // as "Unknown -> Unknown" regardless of what was actually swapped.
      const legs = firstOp.asset_balance_changes || [];
      const outLeg = legs.find((l) => l.from === publicKey);
      const inLeg = legs.find((l) => l.to === publicKey && l !== outLeg);
      firstOp.swapFromCode = outLeg ? (outLeg.asset_type === "native" ? "XLM" : outLeg.asset_code || "Unknown") : "Unknown";
      firstOp.swapToCode = inLeg ? (inLeg.asset_type === "native" ? "XLM" : inLeg.asset_code || "Unknown") : "Unknown";
    }

    const resBal =
      firstOp.asset_balance_changes?.find(
        (resObj) => (resObj.to === publicKey || resObj.from === publicKey) && resObj.type === "transfer"
      ) || null;

    if (resBal) {
      amount = resBal.amount || "0";
      isReceived = resBal.to === publicKey;
    }
  } else if (["change_trust"].includes(firstOp.type)) {
    isReceived = true;
  } else if (firstOp.type === "manage_sell_offer" || firstOp.type === "manage_buy_offer") {
    isReceived = false;
    amount = firstOp.amount;
  }

  return {
    id: tx.id,
    date: formatDate(tx.created_at),
    amount,
    success: tx.successful,
    memo: tx.memo || "No memo",
    operations,
    isReceived,
    sortTime: new Date(tx.created_at).getTime(),
  };
};

const StellarTransactionHistory = ({ publicKey, isDarkMode }) => {
  const colors = getThemeColors(isDarkMode);
  const [allTransactions, setAllTransactions] = useState([]);
  const [displayedTransactions, setDisplayedTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [stellarCursor, setStellarCursor] = useState(null);
  const [isFetchingStellar, setIsFetchingStellar] = useState(false);
  const state = useSelector((state) => state);
  const stellarCursorRef = useRef(null);
  const allTransactionsRef = useRef([]);

  const updateStellarCursor = (token) => {
    setStellarCursor(token);
    stellarCursorRef.current = token;
  };
  useEffect(() => {
    allTransactionsRef.current = allTransactions;
  }, [allTransactions]);

  const refreshSingleTx = async (chainSymbol, txHash) => {
    try {
      const sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);
      const matchedTx = await sdk.getTransferStatus(chainSymbol, txHash);

      let updatedStatus = { chain: chainSymbol, hash: txHash, status: "pending", statusColor: "#eec14fff" };

      if (matchedTx.isSuspended) {
        updatedStatus = { chain: chainSymbol, hash: txHash, status: "failed", statusColor: "#de2727ff" };
      } else if (matchedTx.receive?.txId) {
        const confirmed = matchedTx.receive.confirmations >= (matchedTx.receive.confirmationsNeeded || 0);
        updatedStatus = {
          chain: chainSymbol,
          hash: txHash,
          status: confirmed ? "completed" : "pending",
          statusColor: confirmed ? "#09b317ff" : "#eec14fff",
        };
      } else if (matchedTx.send?.txId) {
        updatedStatus = { chain: chainSymbol, hash: txHash, status: "processing", statusColor: "#eec14fff" };
      }

      await LocalTxManager.updateTxStatus(state?.wallet?.address, updatedStatus);

      const updateTransactions = (txList) =>
        txList.map((tx) => {
          if (tx.id === `wallet_tx_${txHash}` && tx.operations.records[0].chain === chainSymbol) {
            return {
              ...tx,
              success: updatedStatus.status,
              operations: {
                records: [{ ...tx.operations.records[0], status: updatedStatus.status, statusColor: updatedStatus.statusColor }],
              },
            };
          }
          return tx;
        });
      setAllTransactions((prev) => updateTransactions(prev));
      setDisplayedTransactions((prev) => updateTransactions(prev));

      return { status: updatedStatus.status, statusColor: updatedStatus.statusColor };
    } catch (err) {
      console.error("error in refreshing tx:", err);
      return { status: "pending", statusColor: "#eec14fff" };
    }
  };

  const refreshNearIntentTx = async (chainSymbol, depositAddress, depositMemo) => {
    try {
      configure();
      const { status: mappedStatus, statusColor } = await GetNearIntentStatus(depositAddress, depositMemo);

      await LocalTxManager.updateTxStatus(state?.wallet?.address, {
        chain: chainSymbol,
        hash: depositAddress,
        status: mappedStatus,
        statusColor,
      });

      const updateTransactions = (txList) =>
        txList.map((tx) => {
          const op = tx.operations.records[0];
          if (tx.id === `wallet_tx_${depositAddress}` && op.txType === "nearIntent") {
            return { ...tx, success: mappedStatus, operations: { records: [{ ...op, status: mappedStatus, statusColor }] } };
          }
          return tx;
        });

      setAllTransactions((prev) => updateTransactions(prev));
      setDisplayedTransactions((prev) => updateTransactions(prev));

      return { status: mappedStatus, statusColor };
    } catch (err) {
      console.error("error refreshing near intent tx:", err);
      return { status: "pending", statusColor: "#eec14fff" };
    }
  };

  useEffect(() => {
    const autoRefreshPendingTxs = async () => {
      try {
        const currentTxs = allTransactionsRef.current;
        if (!currentTxs || !Array.isArray(currentTxs)) return;

        const pendingWalletTxs = currentTxs.filter((tx) => {
          const op = tx?.operations?.records?.[0];
          const statusStr = typeof tx?.success === "string" ? tx.success.toLowerCase() : String(tx?.success || "").toLowerCase();
          return (
            op?.type === "wallet_tx" &&
            ["pending", "processing", "process"].includes(statusStr) &&
            ((op?.chain && op?.hash) || (op?.txType === "nearIntent" && op?.hash))
          );
        });

        await Promise.all(
          pendingWalletTxs.map((tx) => {
            const op = tx.operations.records[0];
            return op.txType === "nearIntent" ? refreshNearIntentTx(op.chain, op.hash, op.depositMemo) : refreshSingleTx(op.chain, op.hash);
          })
        );
      } catch (error) {
        console.error("Error inside auto refresh function:", error);
      }
    };

    autoRefreshPendingTxs();
    const intervalId = setInterval(autoRefreshPendingTxs, 15000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchTransactions = async () => {
    try {
      const transactionsData = await server.transactions().forAccount(publicKey).order("desc").limit(STELLAR_BATCH_SIZE).call();

      const lastRecord = transactionsData.records[transactionsData.records.length - 1];
      updateStellarCursor(lastRecord?.paging_token || null);

      const processedTransactions = (await Promise.all(transactionsData.records.map((tx) => processStellarTx(tx, publicKey)))).filter(
        (tx) => tx.operations.records[0].type !== "create_claimable_balance"
      );

      const stellarHashes = new Set(transactionsData.records.map((tx) => tx.hash).filter(Boolean));

      let walletTxs = [];
      try {
        const walletResponse = await LocalTxManager.getWalletTx(state?.wallet?.address);

        if (walletResponse?.status && walletResponse?.data && Array.isArray(walletResponse.data)) {
          for (const tx of walletResponse.data) {
            if (!tx.timestamp) continue;
            const currentTime = Date.now();
            const isOlderThan25Min = currentTime - tx.timestamp > 25 * 60 * 1000;
            const txStatus = tx.status?.toLowerCase();
            const isSRBPending = tx.chain === "SRB" && txStatus === "pending";

            if (isSRBPending && isOlderThan25Min && tx.hash) {
              await LocalTxManager.updateTxStatus(state?.wallet?.address, {
                chain: tx.chain,
                hash: tx.hash,
                status: "failed",
                statusColor: "#de2727ff",
              });
            }
          }
          const stellarInvokeTxIds = new Set(
            processedTransactions
              .filter((tx) => tx.operations.records[0].type === "invoke_host_function")
              .map((tx) => tx.operations.records[0].transaction_hash)
              .filter(Boolean)
          );

          const filteredWalletTxs = walletResponse.data.filter((tx) => {
            const isCompletedOrApproval = tx.status === "completed" || ["approval", "Approval"].includes(tx.type);
            const isAlreadyInStellar = tx.hash && stellarHashes.has(tx.hash);
            const isPendingInStellar = isAlreadyInStellar && ["pending", "processing", "process"].includes(tx.status?.toLowerCase());
            const isSRBAlreadyOnStellar = tx.chain === "SRB" && stellarInvokeTxIds.has(tx.hash);
            return !isCompletedOrApproval && !isSRBAlreadyOnStellar && (!isAlreadyInStellar || isPendingInStellar);
          });

          const uniqueWalletTxs = [];
          const seenHashes = new Set();
          filteredWalletTxs.forEach((tx) => {
            const txHash = tx.hash || `${tx.chain}_${tx.timestamp}`;
            if (!seenHashes.has(txHash)) {
              seenHashes.add(txHash);
              uniqueWalletTxs.push(tx);
            }
          });

          uniqueWalletTxs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

          walletTxs = uniqueWalletTxs.map((tx) => {
            const txTimestamp = tx.timestamp;

            if (!txTimestamp) {
              return {
                id: `wallet_tx_${tx.hash || Date.now()}`,
                date: `${tx.chain} - ${tx.symbol || "Cross-chain"}`,
                amount: "0",
                success: tx.status,
                memo: "",
                operations: {
                  records: [
                    {
                      type: "wallet_tx",
                      symbol: tx.symbol,
                      chain: tx.chain,
                      txType: tx.txType,
                      depositMemo: tx.depositMemo,
                      hash: tx.hash,
                      status: tx.status,
                      statusColor: tx.statusColor,
                      transaction_hash: tx.hash,
                      timestamp: txTimestamp,
                    },
                  ],
                },
                isReceived: true,
                sortTime: Date.now(),
              };
            }

            const currentTime = Date.now();
            const isOlderThan25Min = currentTime - txTimestamp > 25 * 60 * 1000;
            const txStatus = tx.status?.toLowerCase();
            const isSRBPending = tx.chain === "SRB" && txStatus === "pending";
            const finalStatus = isSRBPending && isOlderThan25Min ? "failed" : tx.status;
            const finalStatusColor = isSRBPending && isOlderThan25Min ? "#de2727ff" : tx.statusColor;

            return {
              id: `wallet_tx_${tx.hash || txTimestamp}`,
              date: txTimestamp ? formatDate(new Date(txTimestamp)) : `${tx.chain} - ${tx.symbol || "Cross-chain"}`,
              amount: "0",
              success: finalStatus,
              memo: "",
              operations: {
                records: [
                  {
                    type: "wallet_tx",
                    symbol: tx.symbol,
                    chain: tx.chain,
                    depositMemo: tx.depositMemo,
                    txType: tx.txType,
                    hash: tx.hash,
                    status: finalStatus,
                    statusColor: finalStatusColor,
                    transaction_hash: tx.hash,
                    timestamp: txTimestamp,
                  },
                ],
              },
              isReceived: true,
              sortTime: txTimestamp,
            };
          });
        }
      } catch (walletError) {
        console.error("Error fetching wallet transactions:", walletError);
      }

      const allTxs = [...walletTxs, ...processedTransactions];
      allTxs.sort((a, b) => b.sortTime - a.sortTime);

      setAllTransactions(allTxs);
      const initialDisplay = allTxs.slice(0, INITIAL_LOAD);
      setDisplayedTransactions(initialDisplay);
      setCurrentPage(1);
      setHasMore(allTxs.length > INITIAL_LOAD || lastRecord?.paging_token != null);
    } catch (error) {
      console.log("Error fetching transactions:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchMoreStellarTransactions = async () => {
    if (isFetchingStellar || !stellarCursorRef.current) return [];

    setIsFetchingStellar(true);
    try {
      const transactionsData = await server
        .transactions()
        .forAccount(publicKey)
        .order("desc")
        .cursor(stellarCursorRef.current)
        .limit(STELLAR_BATCH_SIZE)
        .call();

      if (transactionsData.records.length > 0) {
        const lastRecord = transactionsData.records[transactionsData.records.length - 1];
        updateStellarCursor(lastRecord?.paging_token || null);

        const processedTransactions = (await Promise.all(transactionsData.records.map((tx) => processStellarTx(tx, publicKey)))).filter(
          (tx) => tx.operations.records[0].type !== "create_claimable_balance"
        );

        return processedTransactions;
      }
      return [];
    } catch (error) {
      console.log("Error fetching more Stellar transactions:", error);
      return [];
    } finally {
      setIsFetchingStellar(false);
    }
  };

  const getFilteredTransactions = (txList, filterTab = selectedTab) => {
    return txList.filter((tx) => {
      const opType = tx.operations.records[0].type;

      if (filterTab === "all") return true;

      if (filterTab === "sent") {
        return (
          !tx.isReceived &&
          opType !== "path_payment_strict_send" &&
          opType !== "path_payment_strict_receive" &&
          opType !== "sellCry" &&
          opType !== "buyCry" &&
          opType !== "wallet_tx" &&
          opType !== "create_account"
        );
      }

      if (filterTab === "received") {
        return (
          tx.isReceived &&
          opType !== "path_payment_strict_send" &&
          opType !== "path_payment_strict_receive" &&
          opType !== "wallet_tx" &&
          opType !== "sellCry" &&
          opType !== "buyCry" &&
          opType !== "create_account"
        );
      }

      if (filterTab === "path") {
        return opType === "path_payment_strict_send" || opType === "path_payment_strict_receive" || opType === "wallet_tx";
      }

      return true;
    });
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    const filteredTxs = getFilteredTransactions(allTransactions, tab);
    setDisplayedTransactions(filteredTxs.slice(0, INITIAL_LOAD));
    setCurrentPage(1);
    setHasMore(filteredTxs.length > INITIAL_LOAD || stellarCursorRef.current !== null);
  };

  const loadMoreTransactions = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);

    try {
      const filteredAll = getFilteredTransactions(allTransactions, selectedTab);
      const currentDisplayedCount = displayedTransactions.filter((tx) => getFilteredTransactions([tx], selectedTab).length > 0).length;

      if (currentDisplayedCount < filteredAll.length) {
        const nextBatch = filteredAll.slice(currentDisplayedCount, currentDisplayedCount + PAGE_SIZE);
        setDisplayedTransactions((prev) => [...prev, ...nextBatch]);
        setHasMore(currentDisplayedCount + PAGE_SIZE < filteredAll.length || stellarCursorRef.current !== null);
      } else {
        if (!stellarCursorRef.current) {
          setHasMore(false);
          return;
        }

        const newStellarTxs = await fetchMoreStellarTransactions();

        if (newStellarTxs.length > 0) {
          const updatedAll = [...allTransactions, ...newStellarTxs].sort((a, b) => b.sortTime - a.sortTime);
          setAllTransactions(updatedAll);

          const newFiltered = getFilteredTransactions(newStellarTxs, selectedTab);
          setDisplayedTransactions((prev) => [...prev, ...newFiltered.slice(0, PAGE_SIZE)]);
          setHasMore(newStellarTxs.length >= STELLAR_BATCH_SIZE || stellarCursorRef.current !== null);
        } else {
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error("Error loading more transactions:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [allTransactions, displayedTransactions, loadingMore, hasMore, selectedTab]);

  useEffect(() => {
    fetchTransactions();
  }, [publicKey]);

  const onRefresh = async () => {
    setAllTransactions([]);
    setDisplayedTransactions([]);
    setLoading(true);
    setLoadingMore(false);
    setRefreshing(false);
    setSelectedTab("all");
    setCurrentPage(1);
    setHasMore(true);
    setStellarCursor(null);
    setIsFetchingStellar(false);
    await fetchTransactions();
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const filteredDisplayedTransactions = getFilteredTransactions(displayedTransactions, selectedTab);

  const refreshTxDispatcher = async (chain, hash, txType, depositMemo) => {
    return txType === "nearIntent" ? refreshNearIntentTx(chain, hash, depositMemo) : refreshSingleTx(chain, hash);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TabBar selectedTab={selectedTab} onTabPress={handleTabChange} isDarkMode={isDarkMode} />

      <FlatList
        data={filteredDisplayedTransactions}
        renderItem={({ item }) => (
          <TransactionCard item={item} userPublicKey={publicKey} isDarkMode={isDarkMode} onRefreshTx={refreshTxDispatcher} />
        )}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={[
          styles.listContent,
          filteredDisplayedTransactions.length === 0 && { flex: 1, justifyContent: "center", alignItems: "center" },
        ]}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMoreTransactions}
        onEndReachedThreshold={0.5}
        ListFooterComponent={() => {
          if (loadingMore) {
            return (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Loading more...</Text>
              </View>
            );
          }
          if (!hasMore && filteredDisplayedTransactions.length > 0) {
            return (
              <View style={styles.footerLoader}>
                <Text style={[styles.endText, { color: colors.secondaryText }]}>&bull; End of transactions &bull;</Text>
              </View>
            );
          }
          return null;
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="history" size={60} color={colors.primaryText} />
            <Text style={[styles.emptyText, { color: colors.primaryText }]}>No transactions found</Text>
            <Text style={[styles.emptySubText, { color: colors.secondaryText }]}>Your transactions will appear here.</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  tabBar: {
    flexDirection: "row",
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  selectedTab: { borderBottomWidth: 2 },
  tabText: { marginLeft: 8, fontSize: 14, fontWeight: "500" },
  listContent: { padding: 16 },
  transactionCard: {
    marginBottom: 12,
    borderRadius: 12,
    flexDirection: "row",
    overflow: "hidden",
  },
  iconContainer: {
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    alignSelf: "center",
    marginLeft: 10,
  },
  chainIconStack: { width: 40, height: 40, position: "relative" },
  chainIconBack: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 38,
    height: 38,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  chainIconFront: {
    position: "absolute",
    bottom: -14,
    right: -10,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  contentContainer: { flex: 1, padding: 12 },
  transactionHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 8,
  },
  refreshButton: { padding: 1 },
  date: { fontSize: 14 },
  providerLabel: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: "bold" },
  transactionDetails: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dualAmountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  type: { fontSize: 16, fontWeight: "500" },
  amount: { fontSize: 16, fontWeight: "bold", textAlign: "right" },
  memo: { fontSize: 14 },
  progressRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 12, paddingHorizontal: 4 },
  progressStep: { alignItems: "center", width: 56 },
  progressDot: { width: 16, height: 16, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  progressLabel: { fontSize: 10, marginTop: 4 },
  progressLine: { flex: 1, height: 2, marginTop: 7 },
  emptyContainer: { alignItems: "center", justifyContent: "center", padding: 20 },
  emptyText: { fontSize: 18, fontWeight: "bold", marginTop: 16 },
  emptySubText: { fontSize: 14, textAlign: "center", marginTop: 8, marginHorizontal: 20 },
  allBridgeTxCon: { zIndex: 20, position: "absolute", width: "100%", maxHeight: "50%", bottom: 25 },
  tryAgainBtn: { backgroundColor: "#4052D6", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  footerLoader: { paddingVertical: 20, alignItems: "center" },
  loadingText: { marginTop: 8, fontSize: 14 },
  endText: { fontSize: 13, fontStyle: "italic" },
});

export default StellarTransactionHistory;