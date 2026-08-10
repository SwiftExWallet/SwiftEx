import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  PanResponder,
  Dimensions,
  ActivityIndicator,
  Platform,
  UIManager,
  ScrollView,
  Image,
} from "react-native";
import { Networks } from "@stellar/stellar-sdk";

import { STELLAR_URL } from "../../Dashboard/constants";
import {
  NearIntentSwapExecute,
  EnsureStellarTrustline,
  GetNearIntentStatus,
  configure,
} from "../nearIntentUtil";
import ShortTermStorage from "../../utilities/ShortTermStorage";
import LocalTxManager from "../../utilities/LocalTxManager";
// CHAINS lives at utilities/TokenUtils, confirmed from the calling screen's
// import: '../../../../../utilities/TokenUtils' (classic.js) resolves to the
// same file as '../../utilities/TokenUtils' from this component's location
// (nearIntent/component/activateWalletUsingNearIntent.js).
import { CHAINS } from "../../utilities/TokenUtils";
// NOTE: adjust this import path to wherever NEARINTENT_ENUM actually lives —
// used the same way your existing services map chainName -> NearIntent chain id.
import { NEARINTENT_ENUM } from "../nearIntentUtil";
// NOTE: adjust this import path to wherever QuoteRequest actually lives —
// only QuoteRequest.refundType.ORIGIN_CHAIN is used here.
import { QuoteRequest } from "@defuse-protocol/one-click-sdk-typescript";
import { useNavigation } from "@react-navigation/native";

const THEME = {
  bg: "#0E1016",
  sheet: "#15171F",
  surface: "#1C1F2A",
  surfaceRaised: "#232634",
  border: "#2A2D3A",
  textPrimary: "#F3F4F8",
  textSecondary: "#9BA0B4",
  textMuted: "#6B7080",
  accent: "#6D8CFF",
  accentSoft: "rgba(109, 140, 255, 0.14)",
  success: "#33D6A6",
  successSoft: "rgba(51, 214, 166, 0.14)",
  warning: "#F5B24D",
  warningSoft: "rgba(245, 178, 77, 0.14)",
  error: "#FF6B6B",
  errorSoft: "rgba(255, 107, 107, 0.14)",
  radiusLg: 24,
  radiusMd: 16,
  radiusSm: 10,
};

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_HEIGHT = Dimensions.get("window").height;
const SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.7);

const STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
};

const DEPOSIT_POLL_INTERVAL_MS = 5000;
const DEPOSIT_POLL_MAX_ATTEMPTS = 180; // ~15 minutes at 5s interval
const DEPOSIT_POLL_MAX_CONSECUTIVE_UNKNOWN = 3;

// Only these assets are eligible for the activation deposit. A chain is only
// offered in the selector if it has at least one bridgeSupportTokens entry
// matching one of these symbols.
const ACTIVATION_ASSET_SYMBOLS = ["USDC", "USDT"];

// Activation always goes EVM -> Stellar, so Stellar itself (which also has a
// bridgeEnable + USDC bridgeSupportTokens entry in CHAINS, for the *inbound*
// side) must never show up as a selectable *origin* chain.
const ORIGIN_EXCLUDED_CHAIN_KEYS = ["STR"];

// A chain only auto-qualifies as the default pick if the wallet holds at
// least this much USDC/USDT on it (activation needs real stablecoin to swap
// from — anything less isn't a usable default).
const MIN_STABLE_BALANCE_FOR_AUTOSELECT = 1;

const STEP_META = [
  { key: "activate", title: "Activate Stellar Account" },
  { key: "trustline", title: "Setup USDC Trustline" },
  { key: "swap", title: "Final Swap" },
];

function isProcessing(steps) {
  return Object.values(steps).some((s) => s === STATUS.LOADING);
}

// ---------------------------------------------------------------------------
// Builds { key, chain, tokens }[] from CHAINS, keeping only chains that are
// bridge-enabled, have at least one USDC/USDT entry in bridgeSupportTokens,
// and aren't the Stellar destination chain itself.
// ---------------------------------------------------------------------------
function buildActivationChains() {
  return Object.entries(CHAINS || {})
    .filter(
      ([key, chain]) =>
        !ORIGIN_EXCLUDED_CHAIN_KEYS.includes(key) &&
        chain?.bridgeEnable &&
        Array.isArray(chain?.bridgeSupportTokens)
    )
    .map(([key, chain]) => {
      const tokens = chain.bridgeSupportTokens.filter((t) =>
        ACTIVATION_ASSET_SYMBOLS.includes(t?.symbol)
      );
      return tokens.length ? { key, chain, tokens } : null;
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Picks the best default chain + USDC/USDT token from the wallet's live
// portfolio, so the selector opens pre-set to a chain the user can actually
// activate from — not just the first chain in the list.
//
// A chain only qualifies if BOTH hold:
//   - it has >= MIN_STABLE_BALANCE_FOR_AUTOSELECT of a recognized USDC/USDT
//     entry (the asset the activation deposit is actually swapped from)
//   - it has a non-zero native-token balance on that same chain (needed to
//     pay gas to broadcast the activation tx)
// Among qualifying chains, the one with the highest matching stablecoin
// balance wins. Returns null if nothing qualifies (caller falls back to the
// first eligible chain, same as before).
// ---------------------------------------------------------------------------
function pickDefaultFromPortfolio(portfolio, activationChains) {
  if (!Array.isArray(portfolio) || !portfolio.length) return null;

  let best = null; // { chainKey, tokenSymbol, stableBalance }

  for (const chainEntry of activationChains) {
    const stableCandidates = chainEntry.tokens
      .map((token) => {
        const portfolioItem = portfolio.find(
          (p) =>
            normalizeChain(p?.chain) === normalizeChain(chainEntry.key) &&
            p?.symbol === token.symbol &&
            String(p?.contractAddress).toLowerCase() ===
            String(token.address).toLowerCase()
        );
        return { token, balance: Number(portfolioItem?.balance) || 0 };
      })
      .filter((c) => c.balance >= MIN_STABLE_BALANCE_FOR_AUTOSELECT);

    if (!stableCandidates.length) continue;

    const nativeItem = portfolio.find(
      (p) => normalizeChain(p?.chain) === normalizeChain(chainEntry.key) && p?.contractAddress === "Native"
    );
    const nativeBalance = Number(nativeItem?.balance) || 0;
    if (nativeBalance <= 0) continue; // no gas on this chain — can't broadcast

    const bestStable = stableCandidates.reduce((a, b) =>
      b.balance > a.balance ? b : a
    );

    if (!best || bestStable.balance > best.stableBalance) {
      best = {
        chainKey: chainEntry.key,
        tokenSymbol: bestStable.token.symbol,
        stableBalance: bestStable.balance,
      };
    }
  }

  return best;
}

function normalizeChain(chain) {
  return chain === "BNB" ? "BSC" : chain;
}
function isSameChain(portfolioChain, chainEntry) {
  return (
    normalizeChain(portfolioChain) === normalizeChain(chainEntry.key) ||
    normalizeChain(portfolioChain) === normalizeChain(chainEntry.chain.symbol) ||
    normalizeChain(portfolioChain) === normalizeChain(chainEntry.chain.chainName)
  );
}
function getChainBestStableBalance(chainEntry, portfolio) {
  if (!Array.isArray(portfolio) || !portfolio.length) return 0;

  let best = 0;
  for (const token of chainEntry.tokens) {
    const portfolioItem = portfolio.find(
      (p) =>
        normalizeChain(p?.chain) === normalizeChain(chainEntry.key) &&
        p?.symbol === token.symbol &&
        String(p?.contractAddress).toLowerCase() ===
        String(token.address).toLowerCase()
    );
    const balance = Number(portfolioItem?.balance) || 0;
    if (balance > best) best = balance;
  }
  return best;
}

function CheckBadge({ status }) {
  const scale = useRef(new Animated.Value(status === STATUS.SUCCESS ? 1 : 0))
    .current;

  useEffect(() => {
    if (status === STATUS.SUCCESS) {
      scale.setValue(0);
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 140,
        useNativeDriver: true,
      }).start();
    }
  }, [status]);

  if (status === STATUS.SUCCESS) {
    return (
      <Animated.View
        style={[
          styles.badge,
          { backgroundColor: THEME.successSoft, transform: [{ scale }] },
        ]}
      >
        <Text style={[styles.badgeGlyph, { color: THEME.success }]}>✓</Text>
      </Animated.View>
    );
  }
  if (status === STATUS.ERROR) {
    return (
      <View style={[styles.badge, { backgroundColor: THEME.errorSoft }]}>
        <Text style={[styles.badgeGlyph, { color: THEME.error }]}>!</Text>
      </View>
    );
  }
  if (status === STATUS.LOADING) {
    return (
      <View style={[styles.badge, { backgroundColor: THEME.accentSoft }]}>
        <ActivityIndicator size="small" color={THEME.accent} />
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: THEME.surface }]}>
      <View style={styles.badgeDot} />
    </View>
  );
}

function CompletedStepRow({ title }) {
  return (
    <View style={styles.completedRow}>
      <View style={[styles.badge, styles.badgeSmall, { backgroundColor: THEME.successSoft }]}>
        <Text style={[styles.badgeGlyph, { color: THEME.success, fontSize: 12 }]}>✓</Text>
      </View>
      <Text style={styles.completedText}>{title}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chain + asset picker shown at the top of the Activate step. Row 1 lets the
// user pick the source EVM chain; row 2 lets them pick which of that chain's
// USDC/USDT entries (from bridgeSupportTokens) to activate with.
// Disabled once activation has started/succeeded so the source can't change
// mid-flight (would desync from an already-submitted deposit).
// ---------------------------------------------------------------------------
function ChainAssetSelector({
  chains,
  portfolio,
  selectedChainKey,
  selectedTokenSymbol,
  onSelectChain,
  onSelectToken,
  disabled,
}) {
  const selectedEntry = chains.find((c) => c.key === selectedChainKey);

  // Only chains that actually have >= $1 USDC/USDT get shown as selectable.
  const chainsWithBalance = chains
  .map((chainEntry) => {
    const native = portfolio.find(
      (p) =>
        isSameChain(p.chain, chainEntry) &&
        p.contractAddress === "Native" &&
        Number(p.balance) > 0
    );

    if (!native) return null;

    let bestToken = null;

    for (const token of chainEntry.tokens) {
      const asset = portfolio.find(
        (p) =>
          isSameChain(p.chain, chainEntry) &&
          p.symbol === token.symbol &&
          Number(p.balance) > 0
      );

      if (!asset) continue;

      if (!bestToken || asset.balanceUSD > bestToken.balanceUSD) {
        bestToken = {
          ...token,
          balanceUSD: asset.balanceUSD,
        };
      }
    }

    if (!bestToken) return null;

    return {
      ...chainEntry,
      stableBalance: bestToken.balanceUSD,
      bestToken,
    };
  })
  .filter(Boolean);

  if (!chains.length) {
    return (
      <View style={styles.selectorEmpty}>
        <Text style={styles.selectorEmptyText}>
          No supported chains configured for activation.
        </Text>
      </View>
    );
  }
  const selectedChain = chainsWithBalance.find(
  (c) => c.key === selectedChainKey
);

const tokensToShow = selectedChain?.bestToken
  ? [selectedChain.bestToken]
  : [];

  return (
    <View style={styles.selectorWrap}>
      <Text style={styles.selectorLabel}>Chain</Text>
      <View style={styles.chipWrap}>
        {chainsWithBalance.map((chainEntry) => {
          const { key, chain, stableBalance } = chainEntry;
          const isSelected = key === selectedChainKey;
          return (
            <Pressable
              key={key}
              disabled={disabled}
              onPress={() => onSelectChain(key)}
              style={({ pressed }) => [
                styles.chip,
                styles.chipWithBubble,
                isSelected && styles.chipSelected,
                disabled && styles.chipDisabled,
                { opacity: pressed && !disabled ? 0.8 : 1 },
              ]}
            >
              <View style={styles.balanceBubble}>
                <Text style={styles.balanceBubbleText}>
                  ${stableBalance >= 100 ? Math.round(stableBalance) : stableBalance.toFixed(2)}
                </Text>
              </View>
              {!!chain.imageUrl && (
                <Image source={{ uri: chain.imageUrl }} style={styles.chipIcon} />
              )}
              <Text
                style={[styles.chipText, isSelected && styles.chipTextSelected]}
                numberOfLines={1}
              >
                {chain.chainName || chain.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.selectorLabel, { marginTop: 10 }]}>Asset</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {tokensToShow.map((token) => {
          const isSelected = token.symbol === selectedTokenSymbol;
          return (
            <Pressable
              key={token.symbol}
              disabled={disabled}
              onPress={() => onSelectToken(token.symbol)}
              style={({ pressed }) => [
                styles.chip,
                isSelected && styles.chipSelected,
                disabled && styles.chipDisabled,
                { opacity: pressed && !disabled ? 0.8 : 1 },
              ]}
            >
              {!!token.logoURI && (
                <Image source={{ uri: token.logoURI }} style={styles.chipIcon} />
              )}
              <Text
                style={[styles.chipText, isSelected && styles.chipTextSelected]}
                numberOfLines={1}
              >
                {token.symbol}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function BuyStableCard({buyCall}) {
  return (
    <View style={[styles.card, { borderColor: THEME.warning, backgroundColor: THEME.warningSoft }]}>
      <View style={styles.cardHeaderRow}>
        <View style={[styles.badge, { backgroundColor: THEME.warningSoft }]}>
          <Text style={[styles.badgeGlyph, { color: THEME.warning }]}>!</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.cardTitle}>No USDC/USDT balance found</Text>
          <Text style={styles.cardDesc}>
            You need at least $1 of USDC or USDT on a supported chain to activate your account.
          </Text>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: THEME.accent, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={buyCall}
      >
        <Text style={[styles.ctaText, { color: "#0E1016" }]}>Buy USDC / USDT</Text>
      </Pressable>
    </View>
  );
}

/**
 * `errorInfo` (when status === ERROR) is either a plain string (legacy /
 * simple errors, always retryable) or `{ message, retryable }` for cases
 * where a retry could be actively harmful (e.g. funds already moved
 * on-chain but backend registration failed) — in that case no CTA is
 * rendered at all, and the message tells the user what to do instead.
 */
function StepCard({
  meta,
  status,
  description,
  errorInfo,
  ctaLabel,
  onPress,
  children,
}) {
  const isDone = status === STATUS.SUCCESS;
  const isError = status === STATUS.ERROR;
  const isLoading = status === STATUS.LOADING;
  const borderColor = isDone ? THEME.success : isError ? THEME.error : THEME.accent;

  const errorMessage = typeof errorInfo === "string" ? errorInfo : errorInfo?.message;
  const retryable = typeof errorInfo === "string" ? true : errorInfo?.retryable !== false;

  const showButton = (isError && retryable) || (!isDone && !isError && !!ctaLabel);

  return (
    <View
      style={[
        styles.card,
        {
          borderColor,
          backgroundColor: isDone ? THEME.successSoft : THEME.surface,
        },
      ]}
    >
      <View style={styles.cardHeaderRow}>
        <CheckBadge status={status} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.cardTitle}>{meta.title}</Text>
          <Text style={styles.cardDesc}>
            {isError && errorMessage ? errorMessage : description}
          </Text>
        </View>
      </View>

      {children}

      {showButton && (
        <Pressable
          disabled={isLoading}
          onPress={onPress}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: isError ? THEME.errorSoft : THEME.accent,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={THEME.textPrimary} />
          ) : (
            <Text
              style={[
                styles.ctaText,
                { color: isError ? THEME.error : "#0E1016" },
              ]}
            >
              {isError ? "Retry" : ctaLabel}
            </Text>
          )}
        </Pressable>
      )}

      {isError && !retryable && (
        <View style={styles.nonRetryableNotice}>
          <Text style={styles.nonRetryableText}>
            This step cannot be retried automatically. Please contact support using the details above.
          </Text>
        </View>
      )}
    </View>
  );
}

export default function StellarSetupBottomSheet({
  visible,
  onDismiss,
  onSetupComplete,
  stellarAcc,
  evmAcc,
  onFinalSwap,
  broadcastTrustline,
}) {
  const naviation=useNavigation();
  const [steps, setSteps] = useState({
    activate: STATUS.IDLE,
    trustline: STATUS.IDLE,
    swap: STATUS.IDLE,
  });
  const [errors, setErrors] = useState({});
  const [depositAddress, setDepositAddress] = useState(null);
  const [trustlinePolling, setTrustlinePolling] = useState(false);

  // ---- derived, previously-passed-in objects -------------------------------
  // stellarAccount / usdcAsset used to be full objects passed in as props;
  // now the caller only gives the two raw addresses, so build the same
  // shapes locally.
  const stellarAccount = useMemo(
    () => ({
      address: stellarAcc,
      horizonUrl: STELLAR_URL.URL,
      networkPassphrase: Networks.PUBLIC,
    }),
    [stellarAcc]
  );

  const usdcAsset = useMemo(() => {
    // NOTE: mirrors CHAINS["STR"].bridgeSupportTokens[0] as used in the
    // caller's old inline usdcAsset — swap for an explicit
    // .find(t => t.symbol === "USDC") if bridgeSupportTokens[0] isn't
    // guaranteed to be USDC.
    const strToken = CHAINS?.STR?.bridgeSupportTokens?.[0];
    if (!strToken) return null;
    return { code: strToken.symbol, issuer: strToken.address };
  }, []);

  // Everything NearIntentSwapExecute needs for the activation swap besides
  // the origin chain/asset (which come from the selector below) — mirrors
  // the caller's old inline evmSwapParams object.
  const baseActivationParams = useMemo(
    () => ({
      destinationBlockchain: "stellar",
      destinationSymbol: "XLM",
      destinatTokenContract: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      amount: "1",
      recipient: stellarAcc,
      activeWalletAddress: evmAcc,
      refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
      refundTo: evmAcc,
    }),
    [stellarAcc, evmAcc]
  );

  // ---- chain / asset selection for the activation deposit -----------------
  const activationChains = useMemo(() => buildActivationChains(), []);
  const portfolio = useSelector((s) => s?.activeWalletPortFolio) || [];

  // Computed once per portfolio/chains change — the chain+token the wallet
  // can actually activate from (enough USDC/USDT + enough native gas).
  // Falls back to null (caller below falls back to the first eligible
  // chain) if nothing in the portfolio qualifies.
  const portfolioDefault = useMemo(
    () => pickDefaultFromPortfolio(portfolio, activationChains),
    [portfolio, activationChains]
  );

  const hasAnyChainBalance = useMemo(
    () =>
      activationChains.some(
        (chainEntry) =>
          getChainBestStableBalance(chainEntry, portfolio) >= MIN_STABLE_BALANCE_FOR_AUTOSELECT
      ),
    [activationChains, portfolio]
  );

  const [selectedChainKey, setSelectedChainKey] = useState(null);
  const [selectedTokenSymbol, setSelectedTokenSymbol] = useState(null);

  // Defaults to the portfolio-recommended chain (or the first eligible
  // chain if nothing in the wallet qualifies) the first time chains are
  // available. Won't clobber a selection the user already made.
  useEffect(() => {
    if (!activationChains.length || selectedChainKey) return;
    const preferredKey = portfolioDefault?.chainKey;
    const preferredEntry = activationChains.find((c) => c.key === preferredKey);
    setSelectedChainKey((preferredEntry ?? activationChains[0]).key);
  }, [activationChains, selectedChainKey, portfolioDefault]);

  const selectedChainEntry = activationChains.find((c) => c.key === selectedChainKey);

  // Default token to the portfolio-recommended USDC/USDT for this chain (if
  // the recommendation matches the currently selected chain), otherwise the
  // first available USDC/USDT entry on the selected chain. Re-picks if the
  // previous symbol isn't offered on this chain.
  useEffect(() => {
    if (!selectedChainEntry) return;
    const stillValid = selectedChainEntry.tokens.some(
      (t) => t.symbol === selectedTokenSymbol
    );
    if (stillValid) return;
    const preferredSymbol =
      portfolioDefault?.chainKey === selectedChainEntry.key
        ? portfolioDefault.tokenSymbol
        : null;
    const fallbackToken =
      selectedChainEntry.tokens.find((t) => t.symbol === preferredSymbol) ??
      selectedChainEntry.tokens[0];
    setSelectedTokenSymbol(fallbackToken?.symbol ?? null);
  }, [selectedChainEntry, selectedTokenSymbol, portfolioDefault]);

  const selectedToken = selectedChainEntry?.tokens.find(
    (t) => t.symbol === selectedTokenSymbol
  );

  // Chain/asset choice can't change once activation has started or finished
  // — it would desync from a deposit that's already in flight/submitted.
  const chainSelectorDisabled =
    steps.activate === STATUS.LOADING || steps.activate === STATUS.SUCCESS;

  // baseActivationParams merged with the user's chain/asset pick — same
  // shape as your existing inline NearIntentSwapExecute call:
  //   originBlockchain: NEARINTENT_ENUM[chainName]
  //   originSymbol: asset.symbol
  //   originTokenContract: asset.address
  //   rpcUrl: CHAINS[...].rpcUrl
  //   chain: asset.name?.toLowerCase()
  //   activeChain: asset.chainId
  const activeEvmSwapParams = useMemo(() => {
    if (!selectedChainEntry || !selectedToken) return null;
    return {
      ...baseActivationParams,
      originBlockchain: NEARINTENT_ENUM[selectedChainEntry.chain.chainName],
      originSymbol: selectedToken.symbol,
      originTokenContract: selectedToken.address,
      rpcUrl: selectedChainEntry.chain.rpcUrl || selectedChainEntry.chain.backupRPCUrls?.[0],
      chain: selectedToken.name?.toLowerCase(),
      activeChain: selectedToken.chainId,
      chainConfig:CHAINS[selectedChainEntry.chain.symbol]
    };
  }, [baseActivationParams, selectedChainEntry, selectedToken]);
  // ---------------------------------------------------------------------

  const activateInFlightRef = useRef(false);
  const trustlineInFlightRef = useRef(false);
  const finalSwapInFlightRef = useRef(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);


  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  // `processing` must include background polling, not just the `steps`
  // state machine — otherwise the sheet can be dismissed (backdrop tap,
  // swipe, hardware back) while a deposit-status poll (and the trustline
  // submission it will trigger) is still running. Note that with the
  // verified-activation state machine, `steps.activate === LOADING` for
  // the whole polling window already covers this via `isProcessing`, but
  // `trustlinePolling` is kept as a belt-and-suspenders guard.
  const processing = isProcessing(steps) || trustlinePolling;

  const currentIndex = useMemo(() => {
    if (steps.activate !== STATUS.SUCCESS) return 0;
    if (steps.trustline !== STATUS.SUCCESS) return 1;
    return 2;
  }, [steps]);

  const swapUnlocked =
    steps.activate === STATUS.SUCCESS && steps.trustline === STATUS.SUCCESS;

  useEffect(() => {
    if (visible) {
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      translateY.setValue(SHEET_HEIGHT);
    }
  }, [visible]);

  useEffect(() => {
    if (swapUnlocked) {
      onSetupComplete && onSetupComplete();
    }
  }, [swapUnlocked]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !processing && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (!processing && g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (processing) {
          // Gesture may have started before `processing` flipped true
          // mid-drag (e.g. a poll kicked off). Snap back rather than
          // leaving the sheet visually stuck mid-drag.
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          return;
        }
        if (g.dy > 120) {
          handleDismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const handleDismiss = useCallback(() => {
    if (processing) return;
    Animated.timing(translateY, {
      toValue: SHEET_HEIGHT,
      duration: 260,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      onDismiss && onDismiss();
    });
  }, [processing, onDismiss]);

  const setStepStatus = (key, status) =>
    setSteps((prev) => ({ ...prev, [key]: status }));

  /**
   * @param {string} key
   * @param {string} message
   * @param {boolean} [retryable=true] Set to false for errors where a retry
   *   could cause a duplicate on-chain action (e.g. funds already sent but
   *   backend registration failed). StepCard hides the Retry CTA in that case.
   */
  const setStepError = (key, message, retryable = true) => {
    setErrors((prev) => ({ ...prev, [key]: { message, retryable } }));
    setStepStatus(key, STATUS.ERROR);
  };

  // ---------------------------------------------------------------------
  // Step 2: Trustline setup — now delegates entirely to the hardened
  // `EnsureStellarTrustline` utility instead of re-implementing raw
  // TransactionBuilder/signing/submission logic locally. That local
  // implementation was missing the `Buffer` import (would crash at
  // runtime), had no balance/reserve check, hardcoded a static fee instead
  // of querying the network, never validated the signer's response, and
  // never checked the submission result's `successful` flag. All of that
  // is handled once, correctly, in the utility module.
  // ---------------------------------------------------------------------
  const runSetupTrustline = useCallback(async () => {
    if (trustlineInFlightRef.current) return undefined;
    trustlineInFlightRef.current = true;
    setStepStatus("trustline", STATUS.LOADING);
    try {
      if (!stellarAccount?.address) {
        throw new Error("Missing Stellar account address");
      }
      if (!usdcAsset?.code || !usdcAsset?.issuer) {
        throw new Error("Missing USDC asset configuration");
      }

      const horizonUrl = stellarAccount?.horizonUrl || STELLAR_URL.URL;
      const networkPassphrase =
        stellarAccount?.networkPassphrase || Networks.PUBLIC;
      configure()
      const result = await EnsureStellarTrustline({
        activeWalletAddress: stellarAccount.address,
        assetCode: usdcAsset.code,
        assetIssuer: usdcAsset.issuer,
        horizonUrl,
        networkPassphrase,
      });

      if (!result.success) {
        throw new Error(result.error?.message || "Could not set up trustline");
      }

      setStepStatus("trustline", STATUS.SUCCESS);
      broadcastTrustline?.();
      return result.data;
    } catch (err) {
      setStepError("trustline", err?.message || "Could not set up trustline");
      return undefined;
    } finally {
      trustlineInFlightRef.current = false;
    }
  }, [stellarAccount, usdcAsset, broadcastTrustline]);

  // ---------------------------------------------------------------------
  // Poll for the activation deposit to actually land on-chain / be
  // confirmed by the swap backend. This is what drives the Activate step
  // from LOADING -> SUCCESS (or -> ERROR) — the Activate step is NOT
  // marked SUCCESS just because `NearIntentSwapExecute` returned; it's
  // only "activated" once this poll observes `status === "completed"`.
  //
  // Runs whenever:
  //   - activate === LOADING   (deposit submitted, not yet verified)
  //   - trustline === IDLE     (haven't already moved on to trustline)
  //   - depositAddress exists  (we have something to poll for)
  //
  // Hardened with: a max-duration bound (was previously unbounded — could
  // poll forever), explicit handling of the "unknown" status distinct
  // from "pending" (an auth/network failure inside GetNearIntentStatus no
  // longer looks identical to "still processing"), and inclusion of
  // `trustlinePolling` in the sheet's dismissal gate (handled above via
  // `processing`; `steps.activate === LOADING` also covers this now).
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (
      steps.activate !== STATUS.LOADING ||
      steps.trustline !== STATUS.IDLE ||
      !depositAddress
    ) {
      return;
    }

    let attempts = 0;
    let consecutiveUnknown = 0;
    setTrustlinePolling(true);

    const intervalId = setInterval(async () => {
      attempts += 1;

      let depositStatus;
      try {
        configure()
        depositStatus = await GetNearIntentStatus(depositAddress);
      } catch (err) {
        // GetNearIntentStatus already catches internally and returns
        // {status:"unknown"} rather than throwing, but guard here too in
        // case of an unexpected rejection so the poller never crashes.
        depositStatus = { status: "unknown", error: err };
      }

      if (!isMountedRef.current) return;

      if (depositStatus.status === "completed") {
        // Deposit verified — this is the only point at which Activate is
        // allowed to become SUCCESS. Immediately kick off the trustline
        // step once it does.
        clearInterval(intervalId);
        setTrustlinePolling(false);
        setStepStatus("activate", STATUS.SUCCESS);
        runSetupTrustline();
        return;
      }

      if (depositStatus.status === "failed" || depositStatus.status === "refunded") {
        clearInterval(intervalId);
        setTrustlinePolling(false);
        setStepError(
          "activate",
          "Your activation deposit failed — please retry"
        );
        return;
      }

      if (depositStatus.status === "unknown") {
        consecutiveUnknown += 1;
        if (consecutiveUnknown >= DEPOSIT_POLL_MAX_CONSECUTIVE_UNKNOWN) {
          clearInterval(intervalId);
          setTrustlinePolling(false);
          setStepError(
            "activate",
            "Unable to check your deposit status — please check your connection and retry"
          );
          return;
        }
      } else {
        consecutiveUnknown = 0;
      }

      if (attempts >= DEPOSIT_POLL_MAX_ATTEMPTS) {
        clearInterval(intervalId);
        setTrustlinePolling(false);
        setStepError(
          "activate",
          "Activation is taking longer than expected — please try again in a few minutes"
        );
      }
    }, DEPOSIT_POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      setTrustlinePolling(false);
    };
  }, [steps.activate, steps.trustline, depositAddress, runSetupTrustline]);

  // ---------------------------------------------------------------------
  // On sheet open, check the wallet's actual on-chain state on Stellar
  // before assuming it needs the full activate -> trustline -> swap flow:
  //   - account doesn't exist on-chain (404)      -> not activated, fall
  //                                                   through to the
  //                                                   LocalTxManager
  //                                                   resume-check below
  //                                                   (maybe a deposit is
  //                                                   already in flight).
  //   - account exists + USDC trustline present   -> both activate and
  //                                                   trustline are
  //                                                   already done; mark
  //                                                   both SUCCESS so the
  //                                                   sheet goes straight
  //                                                   to the swap step.
  //   - account exists + no USDC trustline yet    -> activation is done;
  //                                                   mark activate
  //                                                   SUCCESS and kick off
  //                                                   *only* the trustline
  //                                                   step directly (no
  //                                                   need to touch the
  //                                                   activate/deposit
  //                                                   flow at all).
  //   - network/horizon error                     -> inconclusive, fall
  //                                                   through to the
  //                                                   resume-check as a
  //                                                   safe default.
  // ---------------------------------------------------------------------
  const walletCheckDoneRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      walletCheckDoneRef.current = false;
      return;
    }
    if (walletCheckDoneRef.current) return;
    if (steps.activate !== STATUS.IDLE) return; // don't clobber an in-progress session

    const address = stellarAccount?.address;
    if (!address) return;

    walletCheckDoneRef.current = true;

    (async () => {
      const horizonUrl = stellarAccount?.horizonUrl || STELLAR_URL.URL;
      const accountInfo = await fetchStellarAccountInfo(horizonUrl, address);

      if (!isMountedRef.current) return;

      if (!accountInfo) {
        // Couldn't determine on-chain state (network error) — leave
        // `walletCheckDoneRef` set (avoid retrying every render) but let
        // the resume-check effect below run as a fallback.
        logWarn("wallet activation check inconclusive", { address });
        return;
      }

      if (!accountInfo.activated) {
        // Not activated on-chain yet — normal flow / resume-check applies.
        return;
      }

      const hasTrustline =
        !!usdcAsset?.code &&
        !!usdcAsset?.issuer &&
        accountInfo.balances.some(
          (b) => b.asset_code === usdcAsset.code && b.asset_issuer === usdcAsset.issuer
        );

      if (hasTrustline) {
        resumeCheckedRef.current = true; // wallet + trustline already done; nothing to resume
        setStepStatus("activate", STATUS.SUCCESS);
        setStepStatus("trustline", STATUS.SUCCESS);
        return;
      }

      // Activated, but no trustline yet — skip straight to the trustline
      // step and kick it off, no activation deposit needed.
      setStepStatus("activate", STATUS.SUCCESS);
      resumeCheckedRef.current = true; // wallet is already activated; nothing to resume
      runSetupTrustline();
    })();
  }, [visible, steps.activate, stellarAccount, usdcAsset, runSetupTrustline]);

  // ---------------------------------------------------------------------
  // Resume an in-progress nearIntent tx on sheet open. If the sheet was
  // dismissed (or the app was killed) mid-flow after the activation
  // deposit was sent but before the trustline/final-swap steps finished,
  // `LocalTxManager` still has a record of it (saved in
  // `runActivateAccount`). On open, look it up, fetch its *current*
  // on-chain status once, and:
  //   - if already "completed"      -> deposit is verified: mark activate
  //                                     SUCCESS directly and immediately
  //                                     call runSetupTrustline(). Do NOT
  //                                     set depositAddress / re-enter the
  //                                     polling effect for an already
  //                                     completed deposit.
  //   - if "failed"/"refunded"      -> surface a retryable error on the
  //                                     activate step instead of silently
  //                                     resuming a dead deposit.
  //   - otherwise (pending/
  //     processing/unknown)         -> mark activate LOADING + set
  //                                     depositAddress so the existing
  //                                     poll effect above takes over and
  //                                     keeps polling until it resolves.
  //
  // Uses the real LocalTxManager API: `getWalletTx(walletAddress)` returns
  // `{status, data}` (note: it already silently strips any tx whose
  // stored status is "completed" as a side effect — see LocalTxManager —
  // so a resumed tx we detect as freshly completed here is written back
  // via `updateTxStatus` so it gets cleaned up on the *next* read instead
  // of lingering with a stale "pending" status forever).
  // ---------------------------------------------------------------------
  const resumeCheckedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      resumeCheckedRef.current = false;
      return;
    }
    if (resumeCheckedRef.current) return;
    if (steps.activate !== STATUS.IDLE) return; // don't clobber an in-progress session

    const walletAddress = evmAcc;
    if (!walletAddress) return;

    resumeCheckedRef.current = true;

    const RESUMABLE_STATUSES = ["pending", "processing", "process"];

    (async () => {
      try {
        const walletTxResponse = await LocalTxManager.getWalletTx(walletAddress);
        const existingTxs = walletTxResponse?.status ? walletTxResponse.data : [];
        const pendingNearIntentTx = existingTxs.find(
          (tx) =>
            tx?.txType === "nearIntent" &&
            RESUMABLE_STATUSES.includes(String(tx?.status).toLowerCase())
        );

        if (!pendingNearIntentTx?.hash || !isMountedRef.current) return;

        const resumeDepositAddress = pendingNearIntentTx.hash;
        const resumeChain = pendingNearIntentTx.chain;
        setStepStatus("activate", STATUS.LOADING);

        let depositStatus;
        try {
          configure()
          depositStatus = await GetNearIntentStatus(resumeDepositAddress);
        } catch (err) {
          depositStatus = { status: "unknown", error: err };
        }

        if (!isMountedRef.current) return;

        if (depositStatus.status === "failed" || depositStatus.status === "refunded") {
          LocalTxManager.updateTxStatus(walletAddress, {
            hash: resumeDepositAddress,
            chain: resumeChain,
            status: depositStatus.status,
            statusColor: THEME.error,
          }).catch((e) => logWarn("updateTxStatus failed (resume/failed)", e));
          setStepError(
            "activate",
            "Your previous activation deposit failed — please retry"
          );
          return;
        }

        if (depositStatus.status === "completed") {
          // Write the resolved status back so LocalTxManager's own
          // completed-tx cleanup (in getWalletTx) drops this record next
          // time it's read, instead of it staying "pending" forever.
          LocalTxManager.updateTxStatus(walletAddress, {
            hash: resumeDepositAddress,
            chain: resumeChain,
            status: "completed",
            statusColor: THEME.success,
          }).catch((e) => logWarn("updateTxStatus failed (resume/completed)", e));

          // Deposit is already verified — go straight to SUCCESS and kick
          // off the trustline step. Don't set depositAddress / don't let
          // the polling effect re-poll an already-resolved deposit.
          setStepStatus("activate", STATUS.SUCCESS);
          runSetupTrustline();
          return;
        }

        // Still pending/processing/unknown: deposit was submitted but not
        // yet verified. Keep activate in LOADING and hand off to the
        // existing polling effect via depositAddress.
        setStepStatus("activate", STATUS.LOADING);
        setDepositAddress(resumeDepositAddress);
      } catch (err) {
        logError("resume nearIntent tx check", err);
      }
    })();
  }, [visible, steps.activate, evmAcc]);

  // ---------------------------------------------------------------------
  // Step 1: Activation swap. Already had a correct re-entrancy guard
  // (activateInFlightRef) — kept as-is. Hardened to handle the
  // `depositConfirmedOnChain` partial-failure shape now returned by
  // NearIntentSwapExecute: if the on-chain deposit succeeded but backend
  // registration failed, this is surfaced as a non-retryable error rather
  // than a generic failure with a "Retry" button, since retrying here
  // would resend the activation deposit and duplicate the spend.
  //
  // IMPORTANT: a successful return from NearIntentSwapExecute means the
  // deposit was *submitted*, not that activation is complete. The
  // Activate step stays in LOADING here; only the deposit-polling effect
  // above is allowed to promote it to SUCCESS, once GetNearIntentStatus
  // confirms the deposit actually landed ("completed").
  //
  // Now uses `activeEvmSwapParams` (evmSwapParams merged with the user's
  // chain/asset selection from ChainAssetSelector) instead of the raw
  // `evmSwapParams` prop, so the deposit actually goes out on the chosen
  // chain with the chosen asset.
  // ---------------------------------------------------------------------
  const runActivateAccount = useCallback(async () => {
    if (activateInFlightRef.current) return;

    if (!activeEvmSwapParams?.activeWalletAddress || !activeEvmSwapParams?.rpcUrl) {
      setStepError("activate", "Missing wallet configuration — please reconnect your wallet");
      return;
    }
    if (!selectedChainEntry || !selectedToken) {
      setStepError("activate", "Please choose a chain and asset to activate with");
      return;
    }

    activateInFlightRef.current = true;
    setStepStatus("activate", STATUS.LOADING);
    try {
      configure()
      const result = await NearIntentSwapExecute(activeEvmSwapParams);

      if (!result.success) {
        if (result.data?.depositConfirmedOnChain) {
          // Funds already moved on-chain — do not let the user retry/resend.
          setStepError(
            "activate",
            `Your deposit was sent (tx: ${result.data.txHash}) but we couldn't confirm it with our ` +
            `backend. Please contact support with this transaction hash — do not retry.`,
            /* retryable */ false
          );
          logActivationForRecovery(result.data, stellarAccount, activeEvmSwapParams);
          return;
        }
        throw new Error(result.error?.message || "Account activation failed");
      }

      // Deposit submitted successfully — keep Activate in LOADING and let
      // the polling effect confirm it before flipping to SUCCESS.
      setDepositAddress(result.data.depositAddress);
      await LocalTxManager.saveTx(activeEvmSwapParams?.activeWalletAddress, {
        chain: activeEvmSwapParams.originBlockchain,
        hash: result.data.depositAddress,
        status: "pending",
        statusColor: "#eec14fff",
        timestamp: Date.now(),
        symbol: activeEvmSwapParams.originSymbol,
        amount: activeEvmSwapParams.amount?.toString(),
        txType: "nearIntent"
      });

      ShortTermStorage.syncTx({
        txHash: result.data.depositAddress,
        depositAddress: result.data.depositAddress,
        walletAddress: activeEvmSwapParams?.activeWalletAddress,
        fromAddress: activeEvmSwapParams?.activeWalletAddress,
        toAddress: stellarAccount?.address,
        provider: "NEARINTENT",
        fromChain: activeEvmSwapParams.originBlockchain,
        fromToken: activeEvmSwapParams.originSymbol,
        toChain: "SRB",
        toToken: "XLM",
        amountIn: activeEvmSwapParams.amount,
        amountOut: activeEvmSwapParams.amount,
        txType: "Bridge",
        fromTokenMetaData: activeEvmSwapParams.originSymbol,
      }).catch((e) => logWarn("syncTx logging failed", e));
    } catch (err) {
      setStepError("activate", err?.message || "Could not activate account");
    } finally {
      activateInFlightRef.current = false;
    }
  }, [activeEvmSwapParams, selectedChainEntry, selectedToken, stellarAccount]);

  // ---------------------------------------------------------------------
  // Step 3: Final swap. Added a re-entrancy guard (was missing), a check
  // that `onFinalSwap` actually exists before treating a no-op as success,
  // and support for a structured `{success, data, error}` result from
  // `onFinalSwap` so a `depositConfirmedOnChain`-style partial failure from
  // the underlying swap call can be surfaced as non-retryable here too,
  // instead of only supporting thrown-Error rejections.
  // ---------------------------------------------------------------------
  const runFinalSwap = useCallback(async () => {
    if (!swapUnlocked || finalSwapInFlightRef.current) return;

    if (typeof onFinalSwap !== "function") {
      setStepError("swap", "Swap is not available right now — please try again later");
      return;
    }

    finalSwapInFlightRef.current = true;
    setStepStatus("swap", STATUS.LOADING);
    try {
      const result = await onFinalSwap();

      if (result && result.success === false) {
        if (result.data?.depositConfirmedOnChain) {
          setStepError(
            "swap",
            `Your swap was sent (tx: ${result.data.txHash}) but we couldn't confirm it with our ` +
            `backend. Please contact support with this transaction hash — do not retry.`,
            /* retryable */ false
          );
        } else {
          throw new Error(result.error?.message || "Swap failed");
        }
        return;
      }

      setStepStatus("swap", STATUS.SUCCESS);
    } catch (err) {
      setStepError("swap", err?.message || "Swap failed");
    } finally {
      finalSwapInFlightRef.current = false;
    }
  }, [swapUnlocked, onFinalSwap]);

  const stepHandlers = {
    activate: runActivateAccount,
    trustline: runSetupTrustline,
    swap: runFinalSwap,
  };

  const activeMeta = STEP_META[currentIndex] ?? STEP_META[STEP_META.length - 1];
  const activeKey = activeMeta.key;
  const activeStatus =
    activeKey === "trustline" && trustlinePolling ? STATUS.LOADING : steps[activeKey];

  const descriptionByKey = {
    activate:
      activeStatus === STATUS.LOADING
        ? "Your activation deposit has been submitted — waiting for on-chain verification. This can take a few minutes."
        : "Choose your saved stable to activate your account.",
    trustline:
      "Sign the trustline transaction so your wallet can receive USDC — this may wait briefly for your activation deposit to arrive.",
    swap: "Setup complete. You're ready to swap.",
  };

  const ctaLabelByKey = {
    activate: "Confirm & Pay $1 to Activate",
    trustline: undefined,
    swap: "Swap Now",
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        <Animated.View
          style={[
            styles.sheet,
            { minHeight: SHEET_HEIGHT, transform: [{ translateY }] },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.grabberArea}>
            <View style={styles.grabber} />
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Activate Your Stellar Account</Text>
            <Text style={styles.subtitle}>
              Your Stellar wallet isn't ready yet. Deposit $1 USD to create your account.
            </Text>
          </View>

          <View style={styles.body}>
            {STEP_META.slice(0, currentIndex).map((step) => (
              <CompletedStepRow key={step.key} title={step.title} />
            ))}

            {activeKey === "activate" && hasAnyChainBalance ? (
              <StepCard
                meta={activeMeta}
                status={activeStatus}
                description={descriptionByKey[activeKey]}
                errorInfo={errors[activeKey]}
                ctaLabel={ctaLabelByKey[activeKey]}
                onPress={stepHandlers[activeKey]}
              >
                <ChainAssetSelector
                  chains={activationChains}
                  portfolio={portfolio}
                  selectedChainKey={selectedChainKey}
                  selectedTokenSymbol={selectedTokenSymbol}
                  onSelectChain={setSelectedChainKey}
                  onSelectToken={setSelectedTokenSymbol}
                  disabled={chainSelectorDisabled}
                />
              </StepCard>
            ) : activeKey === "activate" ? (
              <BuyStableCard  buyCall={()=>{naviation.navigate("payout")}}/>
            ) : (
              <StepCard
                meta={activeMeta}
                status={activeStatus}
                description={descriptionByKey[activeKey]}
                errorInfo={errors[activeKey]}
                ctaLabel={ctaLabelByKey[activeKey]}
                onPress={stepHandlers[activeKey]}
              />
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              ⓘ This setup is only required once. After your Stellar address
              is activated and the trustline is created, you'll be able to
              swap directly.
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Local logging helpers. Centralized so it's trivial to wire into
// Sentry/analytics later, and so the "fund-safety-critical, needs manual
// recovery" cases are easy to grep for / alert on.
// ---------------------------------------------------------------------------

/**
 * Fetches the raw Horizon account record to determine on-chain state
 * without going through any signing/tx-building utility.
 * Returns:
 *   - { activated: false, balances: [] }        if the account doesn't
 *                                                 exist yet (404 — not
 *                                                 activated).
 *   - { activated: true, balances: [...] }       if it exists, with the
 *                                                 raw Horizon `balances`
 *                                                 array (native + any
 *                                                 trustlines).
 *   - null                                       on network/parse error
 *                                                 (inconclusive — caller
 *                                                 should treat this as
 *                                                 "don't know" and fall
 *                                                 back to its normal flow
 *                                                 rather than assume
 *                                                 either state).
 */
async function fetchStellarAccountInfo(horizonUrl, address) {
  try {
    const response = await fetch(`${horizonUrl}/accounts/${address}`);
    if (response.status === 404) {
      return { activated: false, balances: [] };
    }
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return { activated: true, balances: Array.isArray(data?.balances) ? data.balances : [] };
  } catch (err) {
    return null;
  }
}

function logError(context, error) {
  // eslint-disable-next-line no-console
  console.error(`[StellarSetupBottomSheet] ${context}:`, error);
}

function logWarn(context, details) {
  // eslint-disable-next-line no-console
  console.warn(`[StellarSetupBottomSheet] ${context}:`, details);
}

function logActivationForRecovery(data, stellarAccount, evmSwapParams) {
  // A deposit succeeded on-chain but never got registered with the swap
  // backend. This must be durably logged (not just console) so it can be
  // reconciled — swap it for your real crash/analytics reporter.
  logError("UNRECOVERED_DEPOSIT — manual follow-up required", {
    txHash: data?.txHash,
    depositAddress: data?.depositAddress,
    walletAddress: stellarAccount?.address,
    originBlockchain: evmSwapParams?.originBlockchain,
    originSymbol: evmSwapParams?.originSymbol,
    amount: evmSwapParams?.amount,
    timestamp: new Date().toISOString(),
  });
  ShortTermStorage.syncTx?.({
    txHash: data?.depositAddress,
    depositAddress: data?.depositAddress,
    walletAddress: evmSwapParams?.activeWalletAddress,
    fromAddress: evmSwapParams?.activeWalletAddress,
    toAddress: stellarAccount?.address,
    provider: "NEARINTENT",
    fromChain: evmSwapParams?.originBlockchain,
    fromToken: evmSwapParams?.originSymbol,
    toChain: "SRB",
    toToken: "XLM",
    amountIn: evmSwapParams?.amount,
    amountOut: evmSwapParams?.amount,
    txType: "Bridge",
    status: "unreconciled_deposit",
    fromTokenMetaData: evmSwapParams?.originSymbol,
  }).catch((e) => logWarn("syncTx logging failed (recovery record)", e));
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(6, 7, 11, 0.6)",
  },
  sheet: {
    backgroundColor: THEME.sheet,
    borderTopLeftRadius: THEME.radiusLg,
    borderTopRightRadius: THEME.radiusLg,
    paddingHorizontal: 20,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  grabberArea: {
    alignItems: "center",
    paddingVertical: 10,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: THEME.border,
  },
  header: {
    marginBottom: 18,
  },
  title: {
    color: THEME.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  subtitle: {
    marginTop: 6,
    color: THEME.textSecondary,
    fontSize: 13.5,
    lineHeight: 19,
  },
  body: {
    flex: 1,
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  completedText: {
    marginLeft: 10,
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  card: {
    borderWidth: 1,
    borderRadius: THEME.radiusMd,
    padding: 14,
    marginTop: 8,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  badgeGlyph: {
    fontSize: 15,
    fontWeight: "700",
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.textMuted,
  },
  cardTitle: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  cardDesc: {
    marginTop: 3,
    color: THEME.textSecondary,
    fontSize: 12.5,
    lineHeight: 17,
  },
  cta: {
    marginTop: 12,
    height: 40,
    borderRadius: THEME.radiusSm,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  nonRetryableNotice: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  nonRetryableText: {
    color: THEME.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
  },
  footer: {
    paddingVertical: 14,
  },
  footerText: {
    color: THEME.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: "center",
  },
  // --- ChainAssetSelector -----------------------------------------------
  selectorWrap: {
    marginTop: 10,
    marginBottom: 4,
  },
  selectorLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  selectorEmpty: {
    marginTop: 10,
    marginBottom: 4,
    padding: 10,
    borderRadius: THEME.radiusSm,
    backgroundColor: THEME.surfaceRaised,
  },
  selectorEmptyText: {
    color: THEME.textMuted,
    fontSize: 12,
  },
  chipRow: {
    paddingRight: 4,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surfaceRaised,
    marginRight: 8,
  },
  chipSelected: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accentSoft,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 6,
  },
  chipText: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: THEME.textPrimary,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: -8, // offsets bottom margin from wrapped rows
  },
  chipWithBubble: {
    marginTop: 10, // room for the bubble poking above the chip
  },
  balanceBubble: {
    position: "absolute",
    top: -10,
    right: -6,
    backgroundColor: THEME.success,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: THEME.sheet,
  },
  balanceBubbleText: {
    color: "#0E1016",
    fontSize: 10,
    fontWeight: "700",
  },
  chipTextDisabled: {
    color: THEME.textMuted,
  },
  buyBtnText: {
    color: THEME.accent,
    fontSize: 11,
    fontWeight: "700",
  },
});