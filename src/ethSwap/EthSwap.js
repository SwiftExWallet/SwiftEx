import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Keyboard,
  NativeModules,
  FlatList
} from 'react-native';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { ethers } from 'ethers';
import { Wallet_screen_header } from '../Dashboard/reusables/ExchangeHeader';
import { useNavigation } from '@react-navigation/native';
import Icon from "react-native-vector-icons/Ionicons";
import { useSelector } from 'react-redux';
import Snackbar from 'react-native-snackbar';
import { PPOST, proxyRequest } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/api';
import { getTokenBalancesUsingAddress } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/utils/getWalletInfo/EtherWalletService';
import ShortTermStorage from '../utilities/ShortTermStorage';
import { CHAINS, isBridgeTokenSupported, isNativeTokenAddress, TemporaryTokens, UI_CHAIN_NAME } from "../utilities/TokenUtils";
import { colors } from "../Screens/ThemeColorsConfig";
import { ChainSupportedToken } from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/ChainWithTokenInfo";
import Modal from "react-native-modal";
import CustomInfoProvider from '../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';
import ToggleSwitch from 'toggle-switch-react-native';
import { ensureFusionAllowance, performeRangoSwap, swapBestRoute, swapConfirmRoute, swapPrepareTx, swapTxSign } from '../utilities/SwapRango';
import { GetStellarAvilabelBalance, GetStellarUSDCAvilabelBalance } from '../utilities/StellarUtils';
import { GetFusionSwapQuote, PerformeFusionPlusNativeSwap, PerformeFusionSwap } from '../utilities/SwapFusion';
import { getChainTokenData, swapPepare } from '../utilities/AllbridgeUtil';
import { swap_prepare } from '../../All_bridge';
import LocalTxManager from '../utilities/LocalTxManager';
import BottomSheetModal from '../Dashboard/reusables/BottomSheetModal';

const ConfirmTx = ({
  visible,
  quote,
  onConfirm,
  onClose,
  fromToken,
  toToken,
  quoteInfo,
  providerQuoteInfo,
  theme,
  styles,
}) => {
  const [confirming, setConfirming] = useState(false);

  // Agar quote ya required fields missing hain toh crash se bachao
  if (!quote || !quote.presets || !quote.recommended_preset) return null;

  const activePreset = quote.presets[quote.recommended_preset];
  const fromAmountRaw = parseFloat(
    ethers.utils.formatUnits(quote.fromTokenAmount, fromToken?.decimals)
  );
  const toAmountRaw = parseFloat(
    ethers.utils.formatUnits(quote.toTokenAmount, toToken?.decimals)
  );
  const toUSDRate = parseFloat(quote.prices?.usd?.toToken || 0);
  const fromUSD = fromAmountRaw * parseFloat(quote.prices?.usd?.fromToken || 0);
  const toUSD = toAmountRaw * toUSDRate;
  const feeAmountRaw = parseFloat(
    ethers.utils.formatUnits(activePreset.tokenFee, toToken?.decimals)
  );
  const feeUSD = feeAmountRaw * toUSDRate;
  const minReceive = parseFloat(
    ethers.utils.formatUnits(activePreset.auctionEndAmount, toToken?.decimals)
  );

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  };

  const Row = ({ label, value, subValue }) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.headingTx }]}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowValue, { color: theme.inactiveTx }]}>{value}</Text>
        {subValue ? (
          <Text style={[styles.rowSubValue, { color: theme.inactiveTx }]}>{subValue}</Text>
        ) : null}
      </View>
    </View>
  );

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  };

  const formatUSD = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.headingTx }]}>Confirm swap</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="close-circle-outline" size={26} color={theme.headingTx} />
          </TouchableOpacity>
        </View>

        {providerQuoteInfo === null ? (
          <ActivityIndicator color={theme.cardSubTx} size="large" />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={[styles.swapCard, { backgroundColor: theme.cardBg }]}>
              <View style={styles.tokenRow}>
                <View style={styles.tokenInfo}>
                  <View style={styles.tokenIcon}>
                    <Image source={{ uri: fromToken?.logoURI }} style={styles.logoImage} />
                  </View>
                  <View>
                    <Text style={[styles.tokenLabel, { color: theme.headingTx }]}>You pay</Text>
                    <Text style={[styles.tokenSymbol, { color: theme.headingTx }]}>
                      {fromToken?.symbol}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.tokenAmount, { color: theme.headingTx }]}>
                    {fromAmountRaw}
                  </Text>
                  <Text style={[styles.tokenUSD, { color: theme.inactiveTx }]}>
                    {formatUSD(fromUSD)}
                  </Text>
                </View>
              </View>

              <View style={styles.arrowWrap}>
                <View style={[styles.arrowLine, { backgroundColor: theme.headingTx }]} />
                <View style={[styles.arrowCircle, { borderColor: theme.headingTx }]}>
                  <Text style={[styles.arrowIcon, { color: theme.headingTx }]}>↓</Text>
                </View>
                <View style={[styles.arrowLine, { backgroundColor: theme.headingTx }]} />
              </View>

              <View style={styles.tokenRow}>
                <View style={styles.tokenInfo}>
                  <View style={styles.tokenIcon}>
                    <Image
                      source={{ uri: toToken?.logoURI }}
                      style={[styles.logoImage, { marginRight: 5 }]}
                    />
                  </View>
                  <View>
                    <Text style={[styles.tokenLabel, { color: theme.headingTx }]}>You receive</Text>
                    <Text style={[styles.tokenSymbol, { color: theme.headingTx }]}>
                      {toToken?.symbol}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.tokenAmount, { color: theme.headingTx }]}>{toAmountRaw}</Text>
                  <Text style={[styles.tokenUSD, { color: theme.inactiveTx }]}>
                    {formatUSD(toUSD)}
                  </Text>
                </View>
              </View>
            </View>

            {parseFloat(quoteInfo.outputAmount) > parseFloat(minReceive) && (
              <View
                style={[
                  styles.warningBanner,
                  { backgroundColor: theme.cardBg, borderColor: theme.inactiveTx },
                ]}
              >
                <Text style={[styles.warningText, { color: '#f19c5bff' }]}>
                  We found a better route for this swap.
                </Text>
              </View>
            )}

            <View style={[styles.detailsCard, { backgroundColor: theme.cardBg }]}>
              <Row label="Provider" value="1inch" />
              <Row
                label="Rate"
                value={`1 ${UI_CHAIN_NAME[fromToken?.symbol]||fromToken?.symbol} = ${toAmountRaw / fromAmountRaw} ${toToken?.symbol}`}
              />
              <View style={[styles.divider, { backgroundColor: theme.smallCardBorderColor }]} />
              <Row label="Min. received" value={`${minReceive} ${toToken?.symbol}`} />
              <View style={[styles.divider, { backgroundColor: theme.smallCardBorderColor }]} />
              <Row
                label="Network fee"
                value={`${feeAmountRaw} ${toToken?.symbol}`}
                subValue={`≈ ${formatUSD(feeUSD)}`}
              />
              <View style={[styles.divider, { backgroundColor: theme.smallCardBorderColor }]} />
              <Row label="Price impact" value={`${quote.priceImpactPercent}%`} />
              <View style={[styles.divider, { backgroundColor: theme.smallCardBorderColor }]} />
              <Row label="Time" value={formatDuration(activePreset.auctionDuration)} />
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, confirming && { opacity: 0.7 }]}
              onPress={handleConfirm}
              disabled={confirming}
              activeOpacity={0.85}
            >
              {confirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.confirmBtnText, { color: theme.headingTx }]}>Confirm swap</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const EthSwap = () => {
  const state = useSelector((state) => state);
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const navigation = useNavigation();
  const [btnDisable, setbtnDisable] = useState(true);
  const [swapExecuting, setSwapExecuting] = useState(false);
  const [refreshTimer, setrefreshTimer] = useState(25);
  const [showRecommendedSlippage, setShowRecommendedSlippage] = useState('1.0');
  const [warningInfo, setWarningInfo] = useState(null);
  const [visibleSlippage, setvisibleSlippage] = useState(false);
  const [showSelectOtherOpt, setShowSelectOtherOpt] = useState(false);
  const [otherOption,setOtherOption] = useState(null);

  const slippageLine = [
    { name: '0.5', value: '0.5' },
    { name: '1.0', value: '1.0' },
    { name: '1.5', value: '1.5' },
    { name: '2.0', value: '2.0' },
  ];

  const intervalRef = useRef(null);

  const defaultQuoteInfo = {
    provider: null,
    rate: null,
    feeTire: null,
    networkFee: null,
    outputAmount: null,
    minimumReceive: null,
    time: null,
    fromToken: null,
    toToken: null,
    fromChain: null,
    toChain: null,
    isFullNull: true,
  };

  const [showTokenSelection, setshowTokenSelection] = useState(false);
  const [selectingFor, setSelectingFor] = useState('from');
  const [fromToken, setFromToken] = useState(null);
  const [toToken, setToToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [fromBalanceLoading, setFromBalanceLoading] = useState(false);
  const [toBalanceLoading, setToBalanceLoading] = useState(false);
  const [selectedRelayerFee, setSelectedRelayerFee] = useState('native');
  const [fromTokenBalance, setFromTokenBalance] = useState(0.0);
  const [xlmNativeBalance, setxlmNativeBalance] = useState(0.0);
  const [toTokenBalance, setToTokenBalance] = useState(0.0);
  const [qoutesLoading, setqoutesLoading] = useState(false);
  const [quoteInfo, setQuoteInfo] = useState(defaultQuoteInfo);
  const [btnMessage, setbtnMessage] = useState('Swap');
  const [goWithGas, setgoWithGas] = useState(false);
  const [visibleConfirmation, setVisibleConfirmation] = useState(false);
  const [providerQuoteInfo, setProviderQuoteInfo] = useState(null);
  const [rangoQuoteInfo, setrangoQuoteInfo] = useState(null);
  const abortControllerRef = useRef(null);
  const [allBridgeQuote, setAllBridgeQuote] = useState({
    provider: 'Allbridge',
    conversionRate: null,
    minimumAmountOut: null,
    slippageTolerance: null,
    completionTime: null,
    fee: {
      native: {
        amount: null,
        symbol: null
      },
      stablecoin: {
        amount: null,
        symbol: null
      }
    },
    isnull: true
  });

  useEffect(() => {
    setShowSelectOtherOpt(false);
    if (!fromToken || !toToken) return;

    const isSTRInvolved =
      fromToken.chain === CHAINS.STR.symbol ||
      toToken.chain === CHAINS.STR.symbol;

    if (!isSTRInvolved) {
      setShowSelectOtherOpt(false);
      return;
    }

    const isFromSupported = isBridgeTokenSupported(
      fromToken.chain,
      fromToken.address ?? fromToken.issuer
    );
    const isToSupported = isBridgeTokenSupported(
      toToken.chain,
      toToken.address ?? toToken.issuer
    );

    if (!isFromSupported) {
      setShowSelectOtherOpt({
            side:"From",
            show:true
          });
    } 
    if (!isToSupported) {
      setShowSelectOtherOpt({
            side:"To",
            show:true
          });
    }
  }, [fromToken, toToken]);

  const switchTokens = async () => {
    const prevFrom = fromToken;
    const prevTo = toToken;
    const prevFromBal = fromTokenBalance;
    const prevToBal = toTokenBalance;

    setFromToken(prevTo);
    setToToken(prevFrom);
    setFromTokenBalance(prevToBal);
    setToTokenBalance(prevFromBal);

    // STR tokens ka balance stale ho sakta hai, re-fetch karo
    if (prevTo) {
      await handleTokenBalance(
        prevTo.address,
        prevTo.chain === CHAINS['STR'].symbol
          ? state?.STELLAR_PUBLICK_KEY
          : state?.wallet?.address,
        prevTo.chain,
        true,
        prevTo
      );
    }
    if (prevFrom) {
      await handleTokenBalance(
        prevFrom.address,
        prevFrom.chain === CHAINS['STR'].symbol
          ? state?.STELLAR_PUBLICK_KEY
          : state?.wallet?.address,
        prevFrom.chain,
        false,
        prevFrom
      );
    }
  };

  const isSameToken = (tokenA, tokenB) => {
    if (!tokenA || !tokenB) return false;

    const idA =
      tokenA.chain === "STR"
        ? tokenA.issuer?.toLowerCase()
        : tokenA.address?.toLowerCase();

    const idB =
      tokenB.chain === "STR"
        ? tokenB.issuer?.toLowerCase()
        : tokenB.address?.toLowerCase();

    if (tokenA.chain !== tokenB.chain) {
      return false;
    }

    const sameToken = idA === idB;

    if (
      tokenA.chain === CHAINS["STR"].symbol &&
      tokenB.chain === CHAINS["STR"].symbol
    ) {
      setShowSelectOtherOpt(false);
      navigation.navigate("newOffer_modal", {
        fromToken: tokenB,
        toToken: tokenA,
      });
      return false;
    }

    return sameToken;
  };

  const handleAmount = (text) => {
    // if (!fromToken || !toToken) {
    //   setbtnDisable(true);
    //   setbtnMessage('Select Token');
    //   return;
    // }

    const replaceComma = text.replace(',', '.');
    let value = replaceComma.replace(/[^0-9.]/g, '');
    const firstDot = value.indexOf('.');
    if (firstDot !== -1) {
      value =
        value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '');
    }
    value = value.replace(/^0+(?=[1-9])/, '');

    setAmount(value);
  };

  useEffect(() => {
    if (qoutesLoading === true) {
      setAllBridgeQuote({
        provider: 'Allbridge',
        conversionRate: null,
        minimumAmountOut: null,
        slippageTolerance: null,
        completionTime: null,
        fee: {
          native: {
            amount: null,
            symbol: null
          },
          stablecoin: {
            amount: null,
            symbol: null
          }
        },
        isnull: true
      });
      setQuoteInfo(defaultQuoteInfo);
    }
  }, [qoutesLoading]);

  const updateQuote = useCallback(async () => {
    if (!fromToken || !toToken) {
      setbtnDisable(true);
      setbtnMessage('Select Token');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setbtnDisable(true);
      setbtnMessage('Enter Amount');
      return;
    }

    if (isSameToken(fromToken, toToken)) {
      setbtnDisable(true);
      setbtnMessage('Same token selected');
      return;
    }

    if (
      fromToken.chain === CHAINS['STR'].symbol &&
      toToken.chain === CHAINS['STR'].symbol
    ) {
      setShowSelectOtherOpt(false);
      navigation.navigate("newOffer_modal",{fromToken:fromToken,toToken:toToken})
      return;
    }

    // this for allbridge call //
    const isSTRInvolved = fromToken.chain === CHAINS.STR.symbol || toToken.chain === CHAINS.STR.symbol;
    const isFromSupported = isBridgeTokenSupported(fromToken.chain, fromToken.address || fromToken.issuer);
    const isToSupported = isBridgeTokenSupported(toToken.chain, toToken.address || toToken.issuer);

    if (isSTRInvolved) {
      if (isFromSupported && isToSupported) {
        setqoutesLoading(true);
        const allbridge = await getChainTokenData(CHAINS[fromToken.chain].chainName, CHAINS[toToken.chain].chainName, fromToken.code || fromToken.symbol, toToken.code || toToken.symbol, amount);
        if (allbridge.success) {
          Keyboard.dismiss();
          setAllBridgeQuote((prev) => ({
            ...prev,
            conversionRate: allbridge.info.conversionRate,
            minimumAmountOut: allbridge.info.minimumAmountOut,
            slippageTolerance: allbridge.info.slippageTolerance,
            completionTime: allbridge.info.completionTime,
            fee: {
              native: {
                amount: allbridge.info.fee.native.amount,
                symbol: allbridge.info.fee.native.symbol
              },
              stablecoin: {
                amount: allbridge.info.fee.stablecoin.amount,
                symbol: allbridge.info.fee.stablecoin.symbol
              }
            },
            isnull: false
          }));
          setqoutesLoading(false);
        } else {
          Keyboard.dismiss();
          setqoutesLoading(false);
        }
        return;
      } else {
        if(!isToSupported){
          setShowSelectOtherOpt({
            side:"To",
            show:true
          });
          return;
        }else{
          setShowSelectOtherOpt({
            side:"From",
            show:true
          });
          return;
        }
      }
    }

    try {
      setWarningInfo(null);
      setqoutesLoading(true);

      if (fromToken.chain === toToken.chain) {
        const quote = await getSwapQuote(fromToken, toToken, amount, fromToken.chain);
        if (quote) {
          if (quote.success) {
            setQuoteInfo((prev) => ({
              ...prev,
              provider: 'uniswap',
              rate: `1 ${UI_CHAIN_NAME[quote.data.inputToken]||quote.data.inputToken} = ${quote.data.pricePerToken} ${quote.data.outputToken}`,
              feeTire: `${Number(quote.data.fee) / 10000}%`,
              networkFee: quote.data.networkFee,
              outputAmount: quote.data.outputAmount,
              minimumReceive: quote.data.minimumReceived,
              fromToken: quote.data.inputToken,
              fromChain: fromToken.chain,
              toToken: quote.data.outputToken,
              toChain: toToken.chain,
              isFullNull: false,
            }));
          }
          const amountNum = parseFloat(amount);
          const balanceNum = parseFloat(fromTokenBalance);
          if (amountNum > balanceNum) {
            setbtnDisable(true);
            setbtnMessage('Insufficient Balance');
          } else {
            setbtnDisable(false);
            setbtnMessage('Swap');
          }
        } else {
          setbtnDisable(true);
          setbtnMessage('No route found');
        }
      } else {
        const getRangoSwaps = await GetFusionSwapQuote(
          fromToken.chain === 'BNB' ? 'BSC' : fromToken.chain,
          fromToken.address,
          toToken.chain === 'BNB' ? 'BSC' : toToken.chain,
          toToken.address,
          ethers.utils.parseUnits(amount, fromToken?.decimals).toString(),
          state?.wallet?.address,
          fromToken.symbol || fromToken.code,
          toToken.symbol || toToken.code
        );

        if (getRangoSwaps.status) {
          setQuoteInfo(getRangoSwaps.response);
          setrangoQuoteInfo(getRangoSwaps.response.response);

          if (
            getRangoSwaps.suggestSlippage.length > 0 &&
            parseFloat(showRecommendedSlippage).toFixed(1) <
            parseFloat(getRangoSwaps.suggestSlippage[0].slippage).toFixed(1)
          ) {
            setWarningInfo({
              message: `We recommend you to increase slippage to at least ${getRangoSwaps.suggestSlippage[0].slippage} for this route.`,
              value: getRangoSwaps.suggestSlippage[0].slippage,
            });
          }

          const amountNum = parseFloat(amount);
          const balanceNum = parseFloat(fromTokenBalance);
          if (amountNum > balanceNum) {
            setbtnDisable(true);
            setbtnMessage('Insufficient Balance');
          } else {
            setbtnDisable(false);
            setbtnMessage('Swap');
          }
        } else {
          setQuoteInfo(defaultQuoteInfo);
          CustomInfoProvider.show(
            'error',
            '!Opps',
            (getRangoSwaps.error || getRangoSwaps.error?.message) ===
              "Cannot read property 'swaps' of null"
              ? 'Unable to get route'
              : getRangoSwaps.error || 'Unable to get route'
          );
          setbtnDisable(true);
          setbtnMessage('No route found');
        }
      }
    } catch (error) {
      setQuoteInfo(defaultQuoteInfo);
      console.error('Update quote error:', error);
      setbtnDisable(true);
      setbtnMessage('Quote failed');
    } finally {
      setqoutesLoading(false);
    }
  }, [fromToken, toToken, amount, showRecommendedSlippage, fromTokenBalance]);

  useEffect(() => {
    if (!fromToken || !toToken || !amount || parseFloat(amount) <= 0) return;
    const timeoutId = setTimeout(() => {
      updateQuote();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [amount, fromToken, toToken, showRecommendedSlippage, updateQuote]);

  useEffect(() => {
    const shouldRun =
      fromToken &&
      toToken &&
      amount &&
      parseFloat(amount) >= 0 &&
      swapExecuting === false;

    if (shouldRun) {
      if (!intervalRef.current) {
        setrefreshTimer(25);
        intervalRef.current = setInterval(() => {
          setrefreshTimer((lastValue) => {
            if (lastValue <= 1) {
              updateQuote();
              return 25;
            }
            return lastValue - 1;
          });
        }, 1000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setrefreshTimer(25);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fromToken, toToken, amount, showRecommendedSlippage, swapExecuting, updateQuote]);

  const getSwapQuote = useCallback(
    async (tokenIn, tokenOut, amountIn, type) => {
      if (!tokenIn || !tokenOut) {
        CustomInfoProvider.show(
          'warning',
          '!Opps',
          'Please choose the "From" and "To" network for swap.'
        );
        return null;
      }
      if (tokenIn.chain !== tokenOut.chain) {
        CustomInfoProvider.show(
          'warning',
          '!Opps',
          'Please choose the same network for both "From" and "To".'
        );
        return null;
      }
      try {
        const payload = {
          tokenIn: {
            address: tokenIn.address,
            symbol: tokenIn.symbol,
            decimals: tokenIn.decimals,
            chainId: tokenIn.chainId,
          },
          tokenOut: {
            address: tokenOut.address,
            symbol: tokenOut.symbol,
            decimals: tokenOut.decimals,
            chainId: tokenOut.chainId,
          },
          amount: amountIn?.toString(),
          recipient: state?.wallet?.address,
        };
        const { res, err } = await proxyRequest(`/v1/quoter/quote`, PPOST, payload);
        if (err?.status) {
          CustomInfoProvider.show(
            'error',
            '!Opps',
            err.message || 'Failed to get quote. Please try again.'
          );
          return null;
        }
        return res;
      } catch (error) {
        console.error('Quote error:', error);
        CustomInfoProvider.show(
          'error',
          '!Opps',
          'Failed to get quote. Please try again in some time.'
        );
        return null;
      } finally {
        setqoutesLoading(false);
      }
    },
    []
  );

  const get1InchQoute = async () => {
    try {
      const { res, err } = await proxyRequest(
        `/v1/swap/1inch/getSwapQuote`,
        PPOST,
        {
          tokenIn:
            fromToken.address === isNativeTokenAddress
              ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
              : fromToken.address,
          tokenOut:
            toToken.address === isNativeTokenAddress
              ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
              : toToken.address,
          amount: ethers.utils.parseUnits(amount, fromToken?.decimals).toString(),
          walletAddress: state?.wallet?.address,
          chain: fromToken.chain === 'BNB' ? 'BSC' : fromToken.chain,
        }
      );
      if (err?.status) {
        CustomInfoProvider.show(
          'error',
          '!Opps',
          Array.isArray(err.message) ? err.message[0] : err.message || 'Failed to get quote. Please try again.'
        );
        return null;
      }
      setProviderQuoteInfo(res);
      if (!visibleConfirmation) {
        setVisibleConfirmation(true);
      }
    } catch (error) {
      console.error('Quote error:', error);
      CustomInfoProvider.show(
        'error',
        '!Opps',
        'Failed to get quote. Please try again in some time.'
      );
      return null;
    } finally {
      setSwapExecuting(false);
    }
  };

  const performeUniswap = async (amount, address) => {
    try {
      const respo = await proxyRequest(`/v1/quoter/swap`, PPOST, {
        tokenIn: {
          address: fromToken.address,
          symbol: fromToken.symbol,
          decimals: fromToken.decimals,
          chainId: fromToken.chainId,
        },
        tokenOut: {
          address: toToken.address,
          symbol: toToken.symbol,
          decimals: toToken.decimals,
          chainId: toToken.chainId,
        },
        amount: amount?.toString(),
        recipient: state?.wallet?.address,
        chainId: fromToken.chain,
      });

      if (respo.err?.status) {
        CustomInfoProvider.show('error', '!Opps', respo.err.message || 'Failed to prepare swap');
        return { status: false, message: respo.err.message || 'Failed to prepare swap' };
      }

      const rawTxs = respo.res.data;
      if (!rawTxs || rawTxs.length === 0) {
        CustomInfoProvider.show('error', '!Opps', 'Swap execution failed');
        return { status: false, message: 'No transactions to sign' };
      }

      const signedTxs = [];
      for (let i = 0; i < rawTxs.length; i++) {
        const tx = rawTxs[i];
        try {
          let transaction;
          const chainId = tx.chainId ? Number(tx.chainId) : 1;
          const isEIP1559 =
            tx.maxFeePerGas !== undefined && tx.maxPriorityFeePerGas !== undefined;

          if (isEIP1559) {
            transaction = {
              nonce: ethers.utils.hexlify(tx.nonce || 0),
              gasPrice: ethers.utils.hexlify(
                ethers.BigNumber.from(tx.maxFeePerGas.toString())
              ),
              gasLimit: ethers.utils.hexlify(
                ethers.BigNumber.from(tx.gasLimit?.toString() || '21000')
              ),
              to: tx.to,
              value: ethers.utils.hexlify(
                ethers.BigNumber.from(tx.value?.toString() || '0')
              ),
              data: tx.data || '0x',
            };
          } else {
            transaction = {
              nonce: ethers.utils.hexlify(tx.nonce || 0),
              gasPrice: ethers.utils.hexlify(
                ethers.BigNumber.from(tx.gasPrice?.toString() || '0')
              ),
              gasLimit: ethers.utils.hexlify(
                ethers.BigNumber.from(tx.gasLimit?.toString() || '21000')
              ),
              to: tx.to,
              value: ethers.utils.hexlify(
                ethers.BigNumber.from(tx.value?.toString() || '0')
              ),
              data: tx.data || '0x',
            };
          }

          const signedTx = await NativeModules.TransactionSigner.signTransaction(
            'eth',
            address,
            JSON.stringify(transaction),
            chainId
          );

          let rawTransaction = signedTx.signedTx;
          if (rawTransaction.startsWith('0x0x')) {
            rawTransaction = rawTransaction.replace(/^0x/, '');
          }
          signedTxs.push(rawTransaction);
        } catch (signError) {
          CustomInfoProvider.show('error', '!Opps', 'Swap execution failed');
          console.error('Sign error:', signError);
          return { status: false, message: 'Transaction signing failed' };
        }
      }

      const { res, err } = await proxyRequest('/v1/eth/swap-transaction/execute', PPOST, {
        txs: signedTxs,
        broadcastChain: fromToken.chain,
      });

      if (err?.status) {
        CustomInfoProvider.show('error', '!Opps', err.message || 'Swap execution failed');
        return { status: false, message: err.message || 'Broadcast failed' };
      }

      if (Array.isArray(res) && res.length > 0) {
        const validTxs = res.filter((item) => item?.txResponse?.hash);
        for (let i = 0; i < validTxs.length; i++) {
          const tx = validTxs[i];
          await ShortTermStorage.syncTx({
            txHash: tx.txResponse.hash,
            walletAddress: state?.wallet?.address,
            provider: i === validTxs.length - 1 ? 'UNISWAP' : 'EVMTX',
            fromChain: fromToken.chain === 'BNB' ? 'BSC' : fromToken.chain,
            fromToken: fromToken.symbol,
            toChain: toToken.chain === 'BNB' ? 'BSC' : toToken.chain,
            toToken: toToken.symbol,
            amountIn: amount?.toString(),
            amountOut: quoteInfo?.outputAmount,
            txType: i === validTxs.length - 1 ? 'Swap' : 'Token Approval',
          });
        }
        CustomInfoProvider.show('success', 'Swap', 'Swap completed successfully');
        navigation.navigate('Transactions');
        return { status: true, message: 'Swap completed successfully' };
      }

      CustomInfoProvider.show('error', 'Swap', 'Swap execution failed');
      return { status: false, message: 'No transaction hash received' };
    } catch (error) {
      CustomInfoProvider.show('error', 'Swap', 'Swap execution failed');
      console.error('Swap execution error:', error);
      return { status: false, message: error.message || 'Swap failed' };
    } finally {
      setSwapExecuting(false);
    }
  };

  const TokenSelector = ({ token, onPress, balance, isLoadingBalance,showEmpty }) => (
    <TouchableOpacity style={[styles.tokenSelector,{borderColor:showEmpty?"#fc0505ff":theme.bg,borderWidth:1}]} onPress={onPress}>
      <View style={[styles.tokenContainer, { width: wp(30) }]}>
        {!token ? (
          <Text style={styles.tokenSymbol}>Select Network</Text>
        ) : (
          <>
            <Image
              source={{ uri: token?.logoURI || token?.icon }}
              style={styles.logoImage}
            />
            <View>
              <Text style={styles.tokenSymbol}>{UI_CHAIN_NAME[token?.symbol || token?.code]||token?.symbol || token?.code}</Text>
              <Text style={styles.tokenChainSymbol}>{token?.chain}</Text>
            </View>
          </>
        )}
      </View>
      {isLoadingBalance ? (
        <ActivityIndicator size="small" color="#4052D6" />
      ) : (
        <View>
          <Text style={styles.tokenBalance} numberOfLines={1}>
            Available
          </Text>
          <Text style={styles.tokenBalance} numberOfLines={1}>
            {balance}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const handleTokenBalance = async (tokenAddress, walletAddress, network, isFromToken, tokenInfo) => {
    try {
      if (isFromToken) {
        setFromBalanceLoading(true);
      } else {
        setToBalanceLoading(true);
      }

      if (network === CHAINS['STR'].symbol) {
        const nonEvmToken = await GetStellarUSDCAvilabelBalance(
          walletAddress,
          tokenInfo?.code,
          tokenInfo?.issuer
        );
      const nativeXLMBal = await GetStellarAvilabelBalance(walletAddress);
      setxlmNativeBalance(parseFloat(nativeXLMBal.availableBalance||0));
        if (nonEvmToken?.availableBalance) {
          if (isFromToken) {
            setFromTokenBalance(parseFloat(nonEvmToken.availableBalance || 0));
          } else {
            setToTokenBalance(parseFloat(nonEvmToken.availableBalance || 0));
          }
        }
      } else {
        const responseBalance = await getTokenBalancesUsingAddress(
          tokenAddress,
          walletAddress,
          network
        );
        if (responseBalance.status) {
          if (isFromToken) {
            setFromTokenBalance(parseFloat(responseBalance?.tokenInfo?.[0]?.balance || 0));
          } else {
            setToTokenBalance(parseFloat(responseBalance?.tokenInfo?.[0]?.balance || 0));
          }
        }
      }
    } catch (error) {
      console.error('Error in handleTokenBalance:', error);
      Snackbar.show({
        text: 'Unable to fetch balance',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: '#ff6b6b',
      });
    } finally {
      if (isFromToken) {
        setFromBalanceLoading(false);
      } else {
        setToBalanceLoading(false);
      }
    }
  };

  const handleSwap = async () => {
    Keyboard.dismiss();

    if (!amount || parseFloat(amount) === 0) {
      Snackbar.show({
        text: 'Please enter a valid amount',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: '#ff6b6b',
      });
      return;
    }

    if (parseFloat(amount) > parseFloat(fromTokenBalance)) {
      Snackbar.show({
        text: 'Insufficient balance',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: '#ff6b6b',
      });
      return;
    }

    setSwapExecuting(true);

    if (fromToken.address === isNativeTokenAddress) {
      const swapResult = await PerformeFusionPlusNativeSwap(state, fromToken, toToken, amount);
      if (swapResult.status === true) {
        setSwapExecuting(false);
        navigation.navigate('Transactions');
      } else {
        CustomInfoProvider.show("error", "!Oops", swapResult.error);
        setSwapExecuting(false);
      }
      return;
    }

    try {
      const respo = await proxyRequest('/v1/swap/1inch/buildFusionOrder', PPOST, {
        quote: providerQuoteInfo,
        tokenIn:
          fromToken.address === isNativeTokenAddress
            ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
            : fromToken.address,
        tokenOut:
          toToken.address === isNativeTokenAddress
            ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
            : toToken.address,
        amount: ethers.utils.parseUnits(amount, fromToken?.decimals).toString(),
        walletAddress: state?.wallet?.address,
        chain: fromToken.chain === 'BNB' ? 'BSC' : fromToken.chain,
      });

      if (respo.err?.status || respo.err?.message) {
        CustomInfoProvider.show(
          'error',
          '!Opps',
          respo.err.message || 'Failed to prepare swap'
        );
        return;
      }

      const { primaryType, types, domain, message } = respo.res.typedData;
      const typedDataJson = JSON.stringify({ primaryType, types, domain, message });
      const result = await NativeModules.TransactionSigner.signTypedData(
        fromToken.chain.toLowerCase(),
        state?.wallet?.address,
        typedDataJson
      );

      const resuleOfAllowance = await ensureFusionAllowance(
        fromToken.address,
        state?.wallet?.address,
        ethers.utils.parseUnits(amount, fromToken?.decimals).toString(),
        fromToken.chain,
        fromToken.chainId
      );

      if (resuleOfAllowance.status !== true) {
        CustomInfoProvider.show(
          'error',
          '!Opps',
          resuleOfAllowance.error?.message || 'Token allowance failed'
        );
        return;
      }

      const submitResult = await proxyRequest('/v1/swap/1inch/submitOrder', PPOST, {
        chain: fromToken.chain === 'BNB' ? 'BSC' : fromToken.chain,
        order: {
          maker: respo.res.typedData.message.maker,
          makerAsset: respo.res.typedData.message.makerAsset,
          takerAsset: respo.res.typedData.message.takerAsset,
          makerTraits: respo.res.typedData.message.makerTraits,
          salt: respo.res.typedData.message.salt,
          makingAmount: respo.res.typedData.message.makingAmount,
          takingAmount: respo.res.typedData.message.takingAmount,
          receiver: state?.wallet?.address,
        },
        quoteId: providerQuoteInfo.quoteId,
        orderHash: respo.res.orderHash,
        extension: respo.res.extension,
        signature: result.signature,
      });

      if (submitResult.err) {
        CustomInfoProvider.show(
          'error',
          '!Opps',
          submitResult.err.message || 'Swap failed'
        );
      } else {
        await ShortTermStorage.syncTx({
          quoteId: providerQuoteInfo.quoteId,
          txHash: respo?.res?.orderHash,
          walletAddress: state?.wallet?.address,
          provider: 'ONEINCH_FUSION',
          fromChain: fromToken.chain === 'BNB' ? 'BSC' : fromToken.chain,
          fromToken: fromToken.symbol,
          toChain: toToken.chain === 'BNB' ? 'BSC' : toToken.chain,
          toToken: toToken.symbol,
          amountIn: amount,
          amountOut: providerQuoteInfo?.toTokenAmount,
          txType: 'Swap',
        });
        CustomInfoProvider.show('success', 'Hurray', 'Swap successful!');
        setTimeout(() => navigation.navigate('Transactions'), 1000);
      }
    } catch (error) {
      console.error('Swap error:', error);
      CustomInfoProvider.show(
        'error',
        '!Opps',
        error.message || 'Swap failed. Please try again'
      );
    } finally {
      setSwapExecuting(false);
    }
  };

  const swapManager = async () => {
    Keyboard.dismiss();
    setSwapExecuting(true);
    if (parseFloat(amount) <= 0) {
      CustomInfoProvider.show("error", "!Oops", "Please enter a valid amount.");
    } else {
      try {
        if (CHAINS[toToken.chain].subName === "STR") {
          try {
            const resultOfBidirectional = await swap_prepare(
              state?.wallet?.address,
              state?.wallet?.address,
              CHAINS[toToken.chain].subName === "STR" ? state.STELLAR_PUBLICK_KEY : state?.wallet?.address,
              amount.toString(),
              fromToken.code || fromToken.symbol,
              toToken.code || toToken.symbol,
              CHAINS[fromToken.chain].chainName,
              selectedRelayerFee,
              CHAINS[toToken.chain].chainName,
            )
            console.info("swap bidirectional response:", resultOfBidirectional);
            if (resultOfBidirectional?.status_task) {
              const { res } = resultOfBidirectional;
              const txHashes = [];
              if (res.approvalTxHash) {
                await ShortTermStorage.syncTx({
                  txHash: res.approvalTxHash,
                  walletAddress: state && state.wallet && state.wallet.address,
                  provider: "EVMTX",
                  fromChain: CHAINS[fromToken.chain].chainName,
                  fromToken: fromToken.code || fromToken.symbol,
                  toChain: CHAINS[toToken.chain].chainName,
                  toToken: toToken.code || toToken.symbol,
                  amountIn: amount.toString(),
                  amountOut: amount.toString(),
                  txType: "Token Approval"
                })
                txHashes.push({
                  chain: CHAINS[fromToken.chain].chainName,
                  hash: res.approvalTxHash,
                  type: "Approval"
                });
              }
              await ShortTermStorage.syncTx({
                txHash: res.transferTxHash,
                walletAddress: state && state.wallet && state.wallet.address,
                provider: "ALLBRIDGE",
                fromChain: CHAINS[fromToken.chain].chainName,
                fromToken: fromToken.code || fromToken.symbol,
                toChain: CHAINS[toToken.chain].chainName,
                toToken: toToken.code || toToken.symbol,
                amountIn: amount.toString(),
                amountOut: amount.toString(),
                txType: "Bridge"
              })
              await LocalTxManager.saveTx(state && state.wallet && state.wallet.address, {
                chain: CHAINS[fromToken.chain].chainName,
                hash: res.transferTxHash,
                status: "pending",
                statusColor: "#eec14fff",
                timestamp: Date.now(),
                symbol: fromToken.code || fromToken.symbol,
                amount: amount.toString(),
              });
              txHashes.push({
                chain: CHAINS[fromToken.chain].chainName,
                hash: res.transferTxHash,
                type: "Transfer"
              });
              CustomInfoProvider.show("success", "Bridge Successfull.");
              setSwapExecuting(false);
            } else {
              setSwapExecuting(false);
              console.error("Transaction failed:", resultOfBidirectional?.res);
              CustomInfoProvider.show("error", resultOfBidirectional?.res || "Bridge Faild.");
            }
          } catch (error) {
            setSwapExecuting(false);
            console.error("Transaction error:", error);
            CustomInfoProvider.show("error", "Bridge Faild.");
          }
        } else {
          const stellarWallet = {
            publicKey: state && state.STELLAR_PUBLICK_KEY
          };
          const result = await swapPepare(
            CHAINS[fromToken.chain].chainName,
            CHAINS[toToken.chain].chainName,
            fromToken.code || fromToken.symbol,
            toToken.code || toToken.symbol,
            amount,
            CHAINS[toToken.chain].subName === "STR" ? state.STELLAR_PUBLICK_KEY : state?.wallet?.address,
            stellarWallet,
            selectedRelayerFee
          );
          if (result.success) {
            setSwapExecuting(false);
            CustomInfoProvider.show("success", "Hurray", "Bridge Successfull.");
          } else {
            setSwapExecuting(false);
            CustomInfoProvider.show("error", "!Oops", result.error || "Bridge Faild.");
            console.info("Bridge__Faild:-", result);
          }
        }
      } catch (error) {
        setSwapExecuting(false);
        console.error("error in Bridge swap execute:", error)
        CustomInfoProvider.show("error", "!Oops", "Bridge Faild.");
      }
    }
  }

  const manageSwaps = async () => {
    setSwapExecuting(true);
    if (goWithGas === true) {
      await get1InchQoute();
    } else if (fromToken.chain !== toToken.chain) {
      if (fromToken.address === isNativeTokenAddress) {
        const swapResult = await PerformeFusionPlusNativeSwap(state, fromToken, toToken, amount);
        if (swapResult.status === true) {
          setSwapExecuting(false);
          navigation.navigate('Transactions');
        } else {
          CustomInfoProvider.show("error", "!Oops", swapResult.error);
          setSwapExecuting(false);
        }
      } else {
        const rangoSwapResult = await PerformeFusionSwap(
          rangoQuoteInfo.quoteId,
          state,
          fromToken,
          toToken,
          amount,
          rangoQuoteInfo
        );
        if (rangoSwapResult.status === true) {
          setSwapExecuting(false);
          navigation.navigate('Transactions');
        } else {
          setSwapExecuting(false);
        }
      }
    } else {
      await performeUniswap(amount, state?.wallet?.address);
    }
  };

  const styles = StyleSheet.create({
    mainCon: { flex: 1, backgroundColor: theme.bg },
    container: { paddingHorizontal: wp(3.3), paddingVertical: hp(1) },
    card: {
      borderRadius: 16,
      paddingVertical: hp(1.5),
      paddingHorizontal: wp(3),
      backgroundColor: theme.cardBg,
      marginTop: hp(1),
    },
    switchButton: {
      borderColor: '#4052D6',
      borderWidth: 1,
      borderRadius: 100,
      padding: 10,
      alignSelf: 'center',
      marginVertical: -16,
      zIndex: 1,
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.bg,
    },
    label: { fontSize: 16, color: '#666', marginBottom: 8 },
    tokenSelector: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      backgroundColor: theme.bg,
      borderRadius: 8,
      marginBottom: 8,
    },
    tokenChainSymbol: { fontSize: 11, fontWeight: '800', color: theme.inactiveTx },
    tokenBalance: {
      fontSize: 14,
      color: theme.inactiveTx,
      width: wp(50),
      textAlign: 'right',
    },
    input: {
      fontSize: 24,
      padding: 12,
      borderRadius: 8,
      backgroundColor: theme.bg,
      color: theme.headingTx,
    },
    quoteTextCon: {
      flexDirection: 'row',
      padding: 12,
      backgroundColor: theme.bg,
      borderRadius: 8,
    },
    quoteText: { fontSize: 24, borderRadius: 8, color: theme.headingTx },
    quoteDetailsContainer: {
      marginTop: hp(1),
      padding: 16,
      backgroundColor: theme.cardBg,
      borderRadius: 8,
      marginHorizontal: hp(1.5),
    },
    quoteTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 12,
      color: theme.headingTx,
    },
    quoteRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    quoteLabel: { fontSize: 14, color: '#666' },
    quoteValue: { fontSize: 14, fontWeight: '500', color: theme.headingTx },
    disclaimerText: {
      fontSize: 12,
      color: theme.inactiveTx,
      marginTop: 8,
      fontStyle: 'italic',
    },
    loadingContainer: { alignItems: 'center', marginTop: hp(1.5) },
    loadingText: { marginTop: 8, color: '#666' },
    tokenContainer: { flexDirection: 'row', alignItems: 'center' },
    logoImage: { height: hp(4), width: wp(8.5), borderRadius: hp(2), marginRight: 5 },
    swapButtonCon: {
      width: wp(90),
      backgroundColor: btnDisable || swapExecuting ? '#666' : '#4052D6',
      justifyContent: 'center',
      alignItems: 'center',
      alignSelf: 'center',
      marginVertical: hp(2.5),
      paddingHorizontal: wp(2),
      paddingVertical: hp(2),
      borderRadius: 10,
    },
    swapButtonConText: { fontSize: 18, color: '#fff', fontWeight: '500' },
    networkCon: {
      width: '99%',
      justifyContent: 'space-between',
      flexDirection: 'row',
      alignContent: 'space-evenly',
      padding: 1,
    },
    tokenInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    tokenSymbol: { fontSize: 15, fontWeight: '600', color: theme.headingTx },
    backdrop: { flex: 1 },
    sheet: {
      borderTopLeftRadius: 40,
      borderTopRightRadius: 40,
      width: wp(100),
      alignSelf: 'center',
    },
    handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
    handle: { width: 36, height: 4, borderRadius: 2 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerTitle: { fontSize: 17, fontWeight: '600' },
    scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
    swapCard: { borderRadius: 16, padding: 16, marginBottom: 16 },
    tokenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    tokenIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tokenLabel: { fontSize: 15, marginBottom: 1 },
    tokenAmount: { fontSize: 18, fontWeight: '600', letterSpacing: -0.5 },
    tokenUSD: { fontSize: 12, marginTop: 2 },
    arrowWrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
    arrowLine: { flex: 1, height: 0.5 },
    arrowCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 0.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 8,
    },
    arrowIcon: { fontSize: 14 },
    detailsCard: {
      borderRadius: 14,
      borderWidth: 0.5,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    rowLabel: { fontSize: 14 },
    rowValue: { fontSize: 14, fontWeight: '500', textAlign: 'right' },
    rowSubValue: { fontSize: 11, marginTop: 2, textAlign: 'right' },
    divider: { height: 0.5, marginHorizontal: -16 },
    warningBanner: {
      borderRadius: 10,
      borderWidth: 0.5,
      padding: 12,
      marginBottom: hp(1.5),
    },
    warningText: { fontSize: 14 },
    confirmBtn: {
      backgroundColor: '#4052D6',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 2,
    },
    confirmBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
    timerCon: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.smallCardBg,
      paddingHorizontal: wp(2.3),
      paddingVertical: hp(0.2),
      borderRadius: 30,
      elevation: 5,
      marginTop: -10,
      borderColor: '#4052D6',
      borderWidth: 1,
    },
    warningCard: {
      borderRadius: 10,
      width: wp(93),
      alignSelf: 'center',
      backgroundColor: theme.cardBg,
      marginHorizontal: wp(1),
      paddingVertical: hp(1),
      paddingHorizontal: wp(4),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    warningConText: { fontSize: 15, maxWidth: wp(66) },
    warningCardBtn: {
      borderRadius: 10,
      width: wp(18),
      height: hp(3),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#4052D6',
    },
    slippageCon: { flexDirection: 'row' },
    visibleSlippageCon: { justifyContent: 'flex-end', margin: 0 },
    visibleSlippageContainer: {
      backgroundColor: theme.cardBg,
      padding: 20,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      minHeight: 250,
    },
    visibleSlippageModalTitle: {
      fontSize: 21,
      color: theme.headingTx,
      fontWeight: 'bold',
      marginBottom: hp(1),
    },
    slippageChips: {
      width: wp(19),
      height: hp(4),
      borderRadius: 10,
      backgroundColor: theme.smallCardBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: wp(1.5),
    },
    slippageChipslabel: { fontSize: 19, color: theme.headingTx, fontWeight: '400' },
    textInputSlippage: {
      color: theme.headingTx,
      fontSize: 19,
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderColor: theme.inactiveTx,
      borderWidth: 1,
      marginTop: hp(2),
    },
    relayFeePayCon: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: wp(0.4),
      width: wp(32)
    },
    relayBtnCon: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bg,
      paddingVertical: 9,
      paddingHorizontal: wp(2.5),
      borderRadius: 9,
      width: wp(16.4)
    },
    feeButtonActive: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
  });
  const isAllbridgeTx = fromToken?.chain === CHAINS.STR.symbol || toToken?.chain === CHAINS.STR.symbol;
  
  const fromAmt = Number(amount || 0);
  const tokenBal = Number(fromTokenBalance || 0);
  const walletBal = Number(xlmNativeBalance|| 0);
  const stableFee = Number(allBridgeQuote?.fee?.stablecoin?.amount || 0);
  const nativeFee = Number(allBridgeQuote?.fee?.native?.amount || 0);
  const isTokenInsufficient = fromAmt > tokenBal;
  const isStableFeeInsufficient = selectedRelayerFee === "stablecoin" && stableFee > tokenBal;
  const isNativeFeeInsufficient = selectedRelayerFee === "native" && nativeFee > walletBal;
  const isInsufficientBalance = isTokenInsufficient || isStableFeeInsufficient || isNativeFeeInsufficient;
  const isDisabled = fromAmt <= 0 || isInsufficientBalance;

  return (
    <View style={styles.mainCon}>
      <Wallet_screen_header title="Swap" onLeftIconPress={() => navigation.goBack()} />
      <ScrollView>
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.networkCon}>
              <Text style={styles.label}>From</Text>
            </View>
            <TokenSelector
              token={fromToken}
              onPress={() => {
                setSelectingFor('from');
                setshowTokenSelection(true);
              }}
              balance={fromTokenBalance}
              isLoadingBalance={fromBalanceLoading}
              showEmpty={toToken&&!fromToken?true:false}
            />
            <TextInput
              maxLength={30}
              returnKeyType="done"
              style={styles.input}
              value={amount}
              onChangeText={(text) => handleAmount(text)}
              placeholder="0.0"
              keyboardType="decimal-pad"
              placeholderTextColor="#666"
            />
          </View>

          <TouchableOpacity style={styles.switchButton} onPress={switchTokens}>
            <Icon name="swap-vertical" size={24} color="#4052D6" />
          </TouchableOpacity>

          <View style={styles.card}>
            <View style={styles.networkCon}>
              <Text style={styles.label}>To</Text>
            </View>
            <TokenSelector
              token={toToken}
              onPress={() => {
                setSelectingFor('to');
                setshowTokenSelection(true);
              }}
              balance={toTokenBalance}
              isLoadingBalance={toBalanceLoading}
              showEmpty={fromToken&&!toToken?true:false}
            />
            {!quoteInfo.isFullNull && (
              <View style={styles.quoteTextCon}>
                <Text style={styles.quoteText}>≈</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {quoteInfo.provider === 'uniswap' ? (
                    <Text style={styles.quoteText}>{quoteInfo.outputAmount}</Text>
                  ) : (
                    <Text style={styles.quoteText}>
                      {ethers.utils.formatUnits(
                        quoteInfo?.outputAmount || 0,
                        toToken?.decimals || 18
                      )}
                    </Text>
                  )}
                </ScrollView>
                <Text style={styles.quoteText}>{quoteInfo.toToken}</Text>
              </View>
            )}
          </View>

          <ChainSupportedToken
            visible={showTokenSelection}
            onclose={() => setshowTokenSelection(false)}
            selectedToken={(item) => {
              if (selectingFor === 'from') {
                if (isSameToken(item, toToken)) {
                  CustomInfoProvider.show('warning', '!Opps', 'From and To token cannot be the same.');
                  setshowTokenSelection(false);
                  return;
                }
                setFromToken(item);
                handleTokenBalance(
                  item.address,
                  item.chain === CHAINS['STR'].symbol
                    ? state?.STELLAR_PUBLICK_KEY
                    : state?.wallet?.address,
                  item.chain,
                  true,
                  item
                );
              } else {
                if (isSameToken(item, fromToken)) {
                  CustomInfoProvider.show('warning', '!Opps', 'From and To token cannot be the same.');
                  setshowTokenSelection(false);
                  return;
                }
                handleTokenBalance(
                  item.address,
                  item.chain === CHAINS['STR'].symbol
                    ? state?.STELLAR_PUBLICK_KEY
                    : state?.wallet?.address,
                  item.chain,
                  false,
                  item
                );
                setToToken(item);
              }
              setshowTokenSelection(false);
            }}
            showOnlyEvm={false}
            showDataType="swapEnable"
            selectedAsset={selectingFor === 'from' ? toToken : fromToken}
          />
        </View>

        {qoutesLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4052D6" />
            <Text style={styles.loadingText}>Getting best quote...</Text>
          </View>
        )}

        {warningInfo !== null && (
          <View style={styles.warningCard}>
            <Text style={[styles.warningConText, { color: '#eec50fff' }]}>
              {warningInfo?.message}
            </Text>
            <TouchableOpacity
              style={styles.warningCardBtn}
              onPress={() => {
                setShowRecommendedSlippage(warningInfo?.value);
                updateQuote();
              }}
            >
              <Text style={[styles.warningConText, { color: '#FFF' }]}>Increase</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Allbridge qoutes */}
        {!allBridgeQuote.isnull && (
          <View style={styles.quoteDetailsContainer}>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteTitle}>Estimated Quote Details</Text>
              <View style={styles.timerCon}>
                <Icon name="time" size={18} color={theme.inactiveTx} />
                <Text style={styles.quoteValue}> {refreshTimer}</Text>
              </View>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Provider</Text>
              <Text style={styles.quoteValue}>{allBridgeQuote.provider}</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Conversion Rate</Text>
              <Text style={styles.quoteValue}>1 {UI_CHAIN_NAME[fromToken.symbol || fromToken.code]||fromToken.symbol || fromToken.code} = {allBridgeQuote.conversionRate} {toToken.symbol || toToken.code}</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Slippage</Text>
              <Text style={styles.quoteValue}>{allBridgeQuote.slippageTolerance} %</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Estimated time</Text>
              <Text style={styles.quoteValue}>{allBridgeQuote.completionTime}</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Relayer Fee</Text>
              <Text style={styles.quoteValue}>{allBridgeQuote.fee[selectedRelayerFee].amount} {allBridgeQuote.fee[selectedRelayerFee].symbol}</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Minimum Received</Text>
              <Text style={styles.quoteValue}>{allBridgeQuote.minimumAmountOut}</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Estimated Received</Text>
              <Text style={styles.quoteValue}>≈ {selectedRelayerFee === "native" ? allBridgeQuote.minimumAmountOut : Math.max(0, parseFloat(allBridgeQuote?.minimumAmountOut || "0") - parseFloat(allBridgeQuote?.fee[selectedRelayerFee].amount))}</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Pay Relayer Fee</Text>
              <View style={styles.relayFeePayCon}>
                <TouchableOpacity style={[
                  styles.relayBtnCon,
                  selectedRelayerFee === 'native' && styles.feeButtonActive
                ]}
                  onPress={() => setSelectedRelayerFee('native')}
                >
                  <Text style={[styles.quoteLabel, { color: selectedRelayerFee === 'native'?"#fff":theme.headingTx }]}>Native</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[
                  styles.relayBtnCon,
                  selectedRelayerFee !== 'native' && styles.feeButtonActive
                ]}
                  onPress={() => setSelectedRelayerFee('stablecoin')}
                >
                  <Text style={[styles.quoteLabel, { color: selectedRelayerFee !== 'native'?"#fff":theme.headingTx }]}>{fromToken.symbol || fromToken.code}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {!quoteInfo.isFullNull && (
          <View style={styles.quoteDetailsContainer}>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteTitle}>Estimated Quote Details</Text>
              <View style={styles.timerCon}>
                <Icon name="time" size={18} color={theme.inactiveTx} />
                <Text style={styles.quoteValue}> {refreshTimer}</Text>
              </View>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Provider</Text>
              <Text style={styles.quoteValue}>{quoteInfo.provider}</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Rate</Text>
              <Text style={styles.quoteValue}>{quoteInfo.rate}</Text>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Slippage</Text>
              <TouchableOpacity
                style={styles.slippageCon}
                onPress={() => setvisibleSlippage(true)}
              >
                <Text style={[styles.quoteValue, { color: '#4052D6' }]}>
                  {Number(showRecommendedSlippage).toFixed(1)}%{' '}
                </Text>
                <Icon name="create" size={18} color="#4052D6" />
              </TouchableOpacity>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Network Fee</Text>
              <View style={{ width: wp(25), flexDirection: 'row' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {quoteInfo.provider === 'uniswap' ? (
                    <Text style={styles.quoteValue}>{quoteInfo.networkFee}</Text>
                  ) : (
                    <Text style={styles.quoteValue}>
                      {ethers.utils.formatUnits(quoteInfo?.networkFee || 0, "ether")}
                    </Text>
                  )}
                </ScrollView>
                <Text style={styles.quoteValue}> {quoteInfo?.fromChain === "ARB" ? "ETH" : quoteInfo?.fromChain}</Text>
              </View>
            </View>

            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Minimum Received</Text>
              <View style={{ width: wp(25), flexDirection: 'row' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {quoteInfo.provider === 'uniswap' ? (
                    <Text style={styles.quoteValue}>{quoteInfo.minimumReceive}</Text>
                  ) : (
                    <Text style={styles.quoteValue}>
                      {ethers.utils.formatUnits(
                        quoteInfo.minimumReceive || 0,
                        toToken?.decimals || 18
                      )}
                    </Text>
                  )}
                </ScrollView>
                <Text style={styles.quoteValue}> {quoteInfo.toToken}</Text>
              </View>
            </View>

            {quoteInfo.provider === 'uniswap' && (
              <View style={styles.quoteRow}>
                <Text style={[styles.quoteLabel, { fontSize: 16 }]}>Go with gas less</Text>
                <View style={{ alignSelf: 'flex-end' }}>
                  <ToggleSwitch
                    isOn={goWithGas}
                    onColor="green"
                    offColor="gray"
                    size="small"
                    onToggle={() => setgoWithGas((prev) => !prev)}
                  />
                </View>
              </View>
            )}

            <Text style={styles.disclaimerText}>
              * This transaction may include extra fees if it involves multiple hops.
            </Text>
          </View>
        )}

        {isAllbridgeTx ?
          <TouchableOpacity
            style={[styles.swapButtonCon,{ backgroundColor: isDisabled||swapExecuting ? theme.inactiveTx : "#4F46E5" }]}
            disabled={swapExecuting || isInsufficientBalance || isDisabled}
            onPress={swapManager}
          >
            <Text style={styles.swapButtonConText}>
              {swapExecuting ? "Wait transaction under process..." : isInsufficientBalance ? "Insufficient Balance" : "Confirm Transaction"}
            </Text>
          </TouchableOpacity>
          : <TouchableOpacity
            style={styles.swapButtonCon}
            disabled={btnDisable || swapExecuting}
            onPress={manageSwaps}
          >
            {swapExecuting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.swapButtonConText}>{btnMessage}</Text>
            )}
          </TouchableOpacity>}
      </ScrollView>

      {providerQuoteInfo !== null && (
        <ConfirmTx
          visible={visibleConfirmation}
          quote={providerQuoteInfo}
          onClose={() => {
            setSwapExecuting(false);
            setVisibleConfirmation(false);
          }}
          onConfirm={async () => {
            setVisibleConfirmation(false);
            await handleSwap();
          }}
          fromToken={fromToken}
          toToken={toToken}
          quoteInfo={quoteInfo}
          providerQuoteInfo={providerQuoteInfo}
          theme={theme}
          styles={styles}
        />
      )}

      <Modal
        isVisible={visibleSlippage}
        onBackdropPress={() => setvisibleSlippage(false)}
        onBackButtonPress={() => setvisibleSlippage(false)}
        swipeDirection="down"
        onSwipeComplete={() => setvisibleSlippage(false)}
        style={styles.visibleSlippageCon}
      >
        <View style={styles.visibleSlippageContainer}>
          <Text style={styles.visibleSlippageModalTitle}>Select Slippage</Text>
          <View>
            <FlatList
              data={slippageLine}
              keyExtractor={(item, index) => index.toString()}
              horizontal
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.slippageChips,
                    {
                      backgroundColor:
                        parseFloat(showRecommendedSlippage).toFixed(1) ===
                          parseFloat(item.value).toFixed(1)
                          ? '#4052D6'
                          : theme.smallCardBg,
                    },
                  ]}
                  onPress={() => {
                    setShowRecommendedSlippage(item.value);
                    setvisibleSlippage(false);
                  }}
                >
                  <Text style={styles.slippageChipslabel}>{item.name} %</Text>
                </TouchableOpacity>
              )}
            />
            <TextInput
              style={styles.textInputSlippage}
              value={showRecommendedSlippage}
              onChangeText={(value) => {
                const data = value.replace(/[^0-9.]/g, '');
                if (parseFloat(data) > 11) {
                  CustomInfoProvider.show(
                    'error',
                    '!Opps',
                    'Your transaction is at risk due to high slippage tolerance.'
                  );
                } else {
                  setShowRecommendedSlippage(data);
                }
              }}
              contextMenuHidden
              keyboardType="numeric"
              maxLength={3}
            />
          </View>
        </View>
      </Modal>
      <BottomSheetModal isVisible={showSelectOtherOpt.show}
        onClose={() => setShowSelectOtherOpt(false)}
        options={showSelectOtherOpt.side==="To"?CHAINS[toToken?.chain]?.bridgeSupportTokens:CHAINS[fromToken?.chain]?.bridgeSupportTokens}
        selectedValue={otherOption}
        onSelect={(selectedtoken) => {setOtherOption(selectedtoken),showSelectOtherOpt.side==="To"?setToToken(selectedtoken):setFromToken(selectedtoken)}}
        theme={theme}
        heading={"Available"}
      />
    </View>
  );
};

export default EthSwap;