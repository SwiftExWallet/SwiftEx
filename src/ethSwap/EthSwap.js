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
  Platform
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
import ErrorComponet from '../utilities/ErrorComponet';
import Snackbar from 'react-native-snackbar';
import { PPOST, proxyRequest } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/api';
import { getTokenBalancesUsingAddress } from '../Dashboard/exchange/crypto-exchange-front-end-main/src/utils/getWalletInfo/EtherWalletService';
import ShortTermStorage from '../utilities/ShortTermStorage';
import { debounce } from 'lodash';
import { CHAINS, TemporaryTokens } from "../utilities/TokenUtils";
import { colors } from "../Screens/ThemeColorsConfig";
import { ChainSupportedToken } from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/ChainWithTokenInfo";
import Modal from "react-native-modal";
import CustomInfoProvider from '../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';
import ToggleSwitch from 'toggle-switch-react-native';
import { swapBestRoute, swapConfirmRoute, swapPrepareTx, swapTxSign } from '../utilities/SwapRango';
import { GetStellarUSDCAvilabelBalance } from '../utilities/StellarUtils';

const EthSwap = () => {
  const state = useSelector((state) => state);
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const navigation = useNavigation();
  const [btnDisable, setbtnDisable] = useState(true);
  const [swapExecuting, setSwapExecuting] = useState(false);
  const [refreshTimer, setrefreshTimer] = useState(25);
  const intervalRef = useRef(null);
  const styles = StyleSheet.create({
    mainCon: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    container: {
      paddingHorizontal: wp(3.3),
      paddingVertical: hp(1)
    },
    card: {
      borderRadius: 16,
      paddingVertical: hp(1.5),
      paddingHorizontal: wp(3),
      backgroundColor: theme.cardBg,
      marginTop: hp(1)
    },
    switchButton: {
      borderColor: "#4052D6",
      borderWidth: 1,
      borderRadius: 100,
      padding: 10,
      alignSelf: 'center',
      marginVertical: -16,
      zIndex: 1,
      position: "relative",
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.bg
    },
    label: {
      fontSize: 16,
      color: '#666',
      marginBottom: 8,
    },
    tokenSelector: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      backgroundColor: theme.bg,
      borderRadius: 8,
      marginBottom: 8,
    },
    tokenChainSymbol: {
      fontSize: 11,
      fontWeight: "800",
      color: theme.inactiveTx
    },
    tokenBalance: {
      fontSize: 14,
      color: theme.inactiveTx,
      width: wp(50),
      textAlign: "right"
    },
    input: {
      fontSize: 24,
      padding: 12,
      borderRadius: 8,
      backgroundColor: theme.bg,
      color: theme.headingTx
    },
    quoteTextCon: {
      flexDirection: "row",
      padding: 12,
      backgroundColor: theme.bg,
      borderRadius: 8,
    },
    quoteText: {
      fontSize: 24,
      borderRadius: 8,
      color: theme.headingTx
    },
    quoteDetailsContainer: {
      marginTop: hp(1),
      padding: 16,
      backgroundColor: theme.cardBg,
      borderRadius: 8,
      marginHorizontal: hp(1.5)
    },
    quoteTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 12,
      color: theme.headingTx
    },
    quoteRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    quoteLabel: {
      fontSize: 14,
      color: '#666',
    },
    quoteValue: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.headingTx
    },
    disclaimerText: {
      fontSize: 12,
      color: theme.inactiveTx,
      marginTop: 8,
      fontStyle: 'italic',
    },
    loadingContainer: {
      alignItems: 'center',
      marginTop: hp(1.5),
    },
    loadingText: {
      marginTop: 8,
      color: '#666',
    },
    tokenContainer: {
      flexDirection: "row",
      alignItems: "center"
    },
    logoImage: {
      height: hp(4),
      width: wp(8.5),
      borderRadius: hp(2),
      marginRight: 5
    },
    swapButtonCon: {
      width: wp(90),
      backgroundColor: btnDisable || swapExecuting ? "#666" : "#4052D6",
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginVertical: hp(2.5),
      paddingHorizontal: wp(2),
      paddingVertical: hp(2),
      borderRadius: 10,
    },
    swapButtonConText: {
      fontSize: 18,
      color: "#fff",
      fontWeight: "500"
    },
    networkCon: {
      width: "99%",
      justifyContent: "space-between",
      flexDirection: "row",
      alignContent: "space-evenly",
      padding: 1
    },
    tokenInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    tokenSymbol: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.headingTx,
    },
    backdrop: {
      flex: 1,
    },
    sheet: {
      borderTopLeftRadius: 40,
      borderTopRightRadius: 40,
      width: wp(100),
      alignSelf: "center"
    },
    handleWrap: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 4,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 32,
    },
    swapCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    tokenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    tokenInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    tokenIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tokenLabel: {
      fontSize: 15,
      marginBottom: 1,
    },
    tokenAmount: {
      fontSize: 18,
      fontWeight: '600',
      letterSpacing: -0.5,
    },
    tokenUSD: {
      fontSize: 12,
      marginTop: 2,
    },
    arrowWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 12,
    },
    arrowLine: {
      flex: 1,
      height: 0.5,
    },
    arrowCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 0.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 8,
    },
    arrowIcon: {
      fontSize: 14,
    },
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
    rowLabel: {
      fontSize: 14,
    },
    rowValue: {
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'right',
    },
    rowSubValue: {
      fontSize: 11,
      marginTop: 2,
      textAlign: 'right',
    },
    divider: {
      height: 0.5,
      marginHorizontal: -16,
    },
    warningBanner: {
      borderRadius: 10,
      borderWidth: 0.5,
      padding: 12,
      marginBottom: hp(1.5)
    },
    warningText: {
      fontSize: 14,
    },
    confirmBtn: {
      backgroundColor: '#4052D6',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 2,
    },
    confirmBtnText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
    },
    timerCon: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: "space-between",
      backgroundColor:theme.smallCardBg,
      paddingHorizontal:wp(2.3),
      paddingVertical:hp(0.2),
      borderRadius:30,
      elevation:5,
      marginTop:-10,
      borderColor:"#4052D6",
      borderWidth:1
    },
  });
  const defaultQuoteInfo = { provider: null, rate: null, feeTire: null, networkFee: null, outputAmount: null, minimumReceive: null, time: null, fromToken: null, toToken: null, fromChain: null, toChain: null, isFullNull: true }
  const [showTokenSelection, setshowTokenSelection] = useState(false);
  const [selectingFor, setSelectingFor] = useState("from");
  const [fromToken, setFromToken] = useState(null);
  const [toToken, setToToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [balanceLoading, setbalanceLoading] = useState(false);
  const [fromTokenBalance, setFromTokenBalance] = useState(0.0);
  const [toTokenBalance, setToTokenBalance] = useState(0.0);
  const [qoutesLoading, setqoutesLoading] = useState(false);
  const [quoteInfo, setQuoteInfo] = useState(defaultQuoteInfo);
  const [btnMessage, setbtnMessage] = useState("Swap");
  const [goWithGas, setgoWithGas] = useState(false);
  const [visibleConfirmation, setVisibleConfirmation] = useState(false);
  const [providerQuoteInfo, setProviderQuoteInfo] = useState(null);
  const [rangoQuoteInfo, setrangoQuoteInfo] = useState(null);
  const abortControllerRef = useRef(null);

  const switchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromTokenBalance(toTokenBalance);
    setToTokenBalance(fromTokenBalance);
  };

  const handleAmount = (text) => {
    if (fromToken.chain === CHAINS["STR"].symbol && toToken.chain === CHAINS["STR"].symbol) {
      CustomInfoProvider.show("info", "Use Stellar Swap Instead?", "This token works on Stellar. Would you like to continue with the faster and easier AMM Swap option?", [
        { text: "Cancel", style: "cancel" },
        { text: "Yes", onPress: () => { navigation.navigate("newOffer_modal") } },
      ]);
    } else {
    const replaceComma = text.replace(',', '.');
    const payAmount = replaceComma
      .replace(/[^0-9.]/g, '')
      .replace(/(\..*?)\..*/g, '$1');
    setAmount(payAmount);
  }
  };

  const updateQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setbtnDisable(true);
      setbtnMessage("Enter Amount");
      return;
    }
    try {
      setqoutesLoading(true);
      if (fromToken.chain === toToken.chain) {
        const quote = await getSwapQuote(fromToken, toToken, amount, fromToken.chain);
        if (quote) {
          if (quote.success) {
            setQuoteInfo(prev => ({
              ...prev,
              provider: "uniswap",
              rate: `1 ${quote.data.inputToken} = ${quote.data.pricePerToken} ${quote.data.outputToken}`,
              feeTire: `${Number(quote.data.fee) / 10000}%`,
              networkFee: quote.data.networkFee,
              outputAmount: quote.data.outputAmount,
              minimumReceive: quote.data.minimumReceived,
              fromToken: quote.data.inputToken,
              fromChain: fromToken.chain,
              toToken: quote.data.outputToken,
              toChain: toToken.chain,
              isFullNull: false
            }));
          }
          const amountNum = parseFloat(amount);
          const balanceNum = parseFloat(fromTokenBalance);
          if (amountNum > balanceNum) {
            setbtnDisable(true);
            setbtnMessage("Insufficient Balance");
          } else {
            setbtnDisable(false);
            setbtnMessage("Swap");
          }
        } else {
          setbtnDisable(true);
          setbtnMessage("No route found");
        }
      } else {
        const getRangoSwaps=await swapBestRoute(CHAINS[fromToken.chain].chainNameInThirdParty,fromToken.symbol||fromToken.code,fromToken.address||fromToken.issuer,CHAINS[toToken.chain].chainNameInThirdParty,toToken.symbol||to.code,toToken.address||toToken.issuer,amount);
        if(getRangoSwaps.status){
          setQuoteInfo(getRangoSwaps.response);
          setrangoQuoteInfo(getRangoSwaps.response.response);
          const amountNum = parseFloat(amount);
          const balanceNum = parseFloat(fromTokenBalance);
          if (amountNum > balanceNum) {
            setbtnDisable(true);
            setbtnMessage("Insufficient Balance");
          } else {
            setbtnDisable(false);
            setbtnMessage("Swap");
          }
        }else{
          setQuoteInfo(defaultQuoteInfo);
          CustomInfoProvider.show("error","!Opps",getRangoSwaps.error||"Unable to get route");
          setbtnDisable(true);
          setbtnMessage("No route found");
        }
        
      }
    } catch (error) {
      setQuoteInfo(defaultQuoteInfo);
      console.error('Update quote error:', error);
      setbtnDisable(true);
      setbtnMessage("Quote failed");
    } finally {
      setqoutesLoading(false);
    }
  };

  useEffect(() => {
    let timeoutId;
    timeoutId = setTimeout(() => {
      updateQuote();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [amount, fromToken, toToken, getSwapQuote]);

  useEffect(() => {
      if (fromToken && toToken && amount && parseFloat(amount) >= 0) {
      if (!intervalRef.current) {
        setrefreshTimer(25);
        intervalRef.current = setInterval(() => {
          setrefreshTimer(lastValue => {
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
  },  [fromToken, toToken]);

  const getSwapQuote = useCallback(async (tokenIn, tokenOut, amountIn, type) => {
    if (!tokenIn || !tokenOut) {
      CustomInfoProvider.show("warning", "!Opps", "Please choose the “From” and “To” network for swap.");
      return null;
    }
    if (tokenIn.chain !== tokenOut.chain) {
      CustomInfoProvider.show("warning", "!Opps", "Please choose the same network for both “From” and “To”.");
      return null;
    }
    try {
      const payload = {
        "tokenIn": {
          "address": tokenIn.address,
          "symbol": tokenIn.symbol,
          "decimals": tokenIn.decimals
        },
        "tokenOut": {
          "address": tokenOut.address,
          "symbol": tokenOut.symbol,
          "decimals": tokenOut.decimals
        },
        "amount": amountIn?.toString(),
        "recipient": state?.wallet?.address,
        "chainId": type
      }
      const { res, err } = await proxyRequest(`/v1/quoter/quote`, PPOST, payload);

      if (err?.status) {
        CustomInfoProvider.show("error", "!Opps", err.message || 'Failed to get quote. Please try again.');
        return null;
      }

      return res;
    } catch (error) {
      console.error('Quote error:', error);
      CustomInfoProvider.show("error", "!Opps", 'Failed to get quote. Please try again in some time.');
      return null;
    } finally {
      setqoutesLoading(false);
    }
  }, []);

  const get1InchQoute = async () => {
    try {
      const { res, err } = await proxyRequest(`/v1/swap/1inch/getSwapQuote`, PPOST,
        {
          tokenIn: fromToken.address,
          tokenOut: toToken.address,
          amount: ethers.utils.parseUnits(amount, fromToken?.decimals).toString(),
          walletAddress: state?.wallet?.address,
          chain: fromToken.chain === "BNB" ? "BSC" : fromToken.chain
        }
      );

      if (err?.status) {
        CustomInfoProvider.show("error", "!Opps", Array.isArray(err.message) ? err.message[0] : err.message || 'Failed to get quote. Please try again.');
        return null;
      }
      setProviderQuoteInfo(res);
      setVisibleConfirmation(true)
    } catch (error) {
      console.error('Quote error:', error);
      CustomInfoProvider.show("error", "!Opps", 'Failed to get quote. Please try again in some time.');
      return null;
    } finally {
      setSwapExecuting(false);
    }
  }

  const performeUniswap = async (amount, address) => {
    try {
      const respo = await proxyRequest(`/v1/quoter/swap`, PPOST, {
        "tokenIn": {
          "address": fromToken.address,
          "symbol": fromToken.symbol,
          "decimals": fromToken.decimals
        },
        "tokenOut": {
          "address": toToken.address,
          "symbol": toToken.symbol,
          "decimals": toToken.decimals
        },
        "amount": amount?.toString(),
        "recipient": state?.wallet?.address,
        "chainId": fromToken.chain
      });

      if (respo.err?.status) {
        CustomInfoProvider.show('error', "!Opps", respo.err.message || "Failed to prepare swap");
        return {
          status: false,
          message: respo.err.message || "Failed to prepare swap",
        };
      }

      const rawTxs = respo.res.data;

      if (!rawTxs || rawTxs.length === 0) {
        CustomInfoProvider.show('error', "!Opps", "Swap execution faild");
        return {
          status: false,
          message: "No transactions to sign",
        };
      }

      const signedTxs = [];

      for (let i = 0; i < rawTxs.length; i++) {
        const tx = rawTxs[i];

        try {
          let transaction;
          let chainId = tx.chainId ? Number(tx.chainId) : 1;
          const isEIP1559 = tx.maxFeePerGas !== undefined && tx.maxPriorityFeePerGas !== undefined;

          if (isEIP1559) {
            const gasPrice = tx.maxFeePerGas;
            transaction = {
              nonce: ethers.utils.hexlify(tx.nonce || 0),
              gasPrice: ethers.utils.hexlify(ethers.BigNumber.from(gasPrice.toString())),
              gasLimit: ethers.utils.hexlify(ethers.BigNumber.from(tx.gasLimit?.toString() || "21000")),
              to: tx.to,
              value: ethers.utils.hexlify(ethers.BigNumber.from(tx.value?.toString() || "0")),
              data: tx.data || "0x",
            };
          } else {
            transaction = {
              nonce: ethers.utils.hexlify(tx.nonce || 0),
              gasPrice: ethers.utils.hexlify(ethers.BigNumber.from(tx.gasPrice?.toString() || "0")),
              gasLimit: ethers.utils.hexlify(ethers.BigNumber.from(tx.gasLimit?.toString() || "21000")),
              to: tx.to,
              value: ethers.utils.hexlify(ethers.BigNumber.from(tx.value?.toString() || "0")),
              data: tx.data || "0x",
            };
          }
          const signedTx = await NativeModules.TransactionSigner.signTransaction(
            "eth",
            address,
            JSON.stringify(transaction),
            chainId
          );

          let rawTransaction = signedTx.signedTx;
          if (rawTransaction.startsWith("0x0x")) {
            rawTransaction = rawTransaction.replace(/^0x/, "");
          }
          signedTxs.push(rawTransaction);
          console.log(`Transaction ${i + 1}/${rawTxs.length} signed`);
        } catch (signError) {
          CustomInfoProvider.show('error', "!Opps", "Swap execution faild");
          console.error(`Sign error:`, signError);
          return {
            status: false,
            message: "Transaction signing failed",
          };
        }
      }

      const { res, err } = await proxyRequest("/v1/eth/swap-transaction/execute", PPOST, { txs: signedTxs, broadcastChain: fromToken.chain });

      if (err?.status) {
        CustomInfoProvider.show('error', "!Opps", err.message || "Swap execution faild");
        return {
          status: false,
          message: err.message || "Broadcast failed",
        };
      }

      if (Array.isArray(res) && res.length > 0) {
        const validTxs = res.filter(item => item?.txResponse?.hash);

        for (const tx of validTxs) {
          await ShortTermStorage.saveTx(state?.wallet?.address, {
            chain: fromToken.chain,
            typeTx: "Swap",
            status: "Pending",
            hash: tx.txResponse.hash,
          });
        }
        CustomInfoProvider.show('success', "Swap", "Swap completed successfully");
        navigation.navigate("Transactions");
        return {
          status: true,
          message: "Swap completed successfully",
        };
      }
      CustomInfoProvider.show('error', "Swap", "Swap execution faild");
      return {
        status: false,
        message: "No transaction hash received",
      };
    } catch (error) {
      CustomInfoProvider.show('error', "Swap", "Swap execution faild");
      console.error("Swap execution error:", error);
      return {
        status: false,
        message: error.message || "Swap failed",
      };
    } finally {
      setSwapExecuting(false);
    }
  };

  const TokenSelector = ({ token, onPress, balance }) => (
    <TouchableOpacity style={styles.tokenSelector} onPress={onPress}>
      <View style={[styles.tokenContainer, { width: wp(30) }]}>
        {!token ?
          <Text style={styles.tokenSymbol}>Select Network</Text> :
          <>
            <Image source={{ uri: token?.logoURI||token?.icon }} style={[styles.logoImage]} />
            <View>
              <Text style={styles.tokenSymbol}>
                {token?.symbol||token?.code}
              </Text>
              <Text style={styles.tokenChainSymbol}>
                {token?.chain}
              </Text>
            </View>
          </>
        }
      </View>
      {balanceLoading ? (
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

  const handleTokenBalance = async (tokenAddress, walletAddress, network, fromToken,tokenInfo) => {
    try {
      setbalanceLoading(true);
      if (network === CHAINS["STR"].symbol) {
        const nonEvmToken = await GetStellarUSDCAvilabelBalance(walletAddress, tokenInfo?.code, tokenInfo?.issuer);
        if (!nonEvmToken?.status) {
          fromToken ? setFromTokenBalance(parseFloat(nonEvmToken.availableBalance || 0)) : setToTokenBalance(parseFloat(nonEvmToken.availableBalance || 0));
        }
      } else {
      const responseBalance = await getTokenBalancesUsingAddress(tokenAddress, walletAddress, network);
      if (responseBalance.status) {
        fromToken ? setFromTokenBalance(parseFloat(responseBalance?.tokenInfo?.[0]?.balance || 0)) : setToTokenBalance(parseFloat(responseBalance?.tokenInfo?.[0]?.balance || 0));
      }
      }
    } catch (error) {
      console.error("Error in handleTokenBalance:", error);
      Snackbar.show({
        text: "Unable to fetch balance",
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: '#ff6b6b',
      });
    } finally {
      setbalanceLoading(false);
    }
  }

  const handleSwap = async () => {
    Keyboard.dismiss();

    if (!amount || parseFloat(amount) === 0) {
      Snackbar.show({
        text: "Please enter a valid amount",
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: '#ff6b6b',
      });
      return;
    }

    if (parseFloat(amount) > parseFloat(fromTokenBalance)) {
      Snackbar.show({
        text: "Insufficient balance",
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: '#ff6b6b',
      });
      return;
    }

    setSwapExecuting(true);
    try {
      const respo = await proxyRequest("/v1/swap/1inch/buildFusionOrder", PPOST, {
        quote: providerQuoteInfo,
        tokenIn: fromToken.address,
        tokenOut: toToken.address,
        amount: ethers.utils.parseUnits(amount, fromToken?.decimals).toString(),
        walletAddress: state?.wallet?.address,
        chain: fromToken.chain
      });
      if (respo.err?.status) {
        return {
          status: false,
          message: respo.err.message || "Failed to prepare swap",
        };
      }

      const { primaryType, types, domain, message } = respo.res.typedData;
      const typedDataJson = JSON.stringify({
        primaryType,
        types,
        domain,
        message,
      });
      const result = await NativeModules.TransactionSigner.signTypedData(
        fromToken.chain.toLowerCase(),
        state?.wallet?.address,
        typedDataJson,
      );
      console.error("result", typeof (result.signature))
      const submitResult = await proxyRequest("/v1/swap/1inch/submitOrder", PPOST, {
        "chain": fromToken.chain,
        "order": {
          "maker": respo.res.typedData.message.maker,
          "makerAsset": respo.res.typedData.message.makerAsset,
          "takerAsset": respo.res.typedData.message.takerAsset,
          "makerTraits": respo.res.typedData.message.makerTraits,
          "salt": respo.res.typedData.message.salt,
          "makingAmount": respo.res.typedData.message.makingAmount,
          "takingAmount": respo.res.typedData.message.takingAmount,
          "receiver": state?.wallet?.address,
        },
        "quoteId": providerQuoteInfo.quoteId,
        "extension": respo.res.extension,
        "signature": result.signature
      });
      console.error("submitResult", submitResult)
      if (submitResult.err) {
        CustomInfoProvider.show("error", "!Opps", submitResult.err.message || "Swap failed");
      } else {
        CustomInfoProvider.show("success", "Hurray", "Swap successful!");
        setTimeout(() => {
          navigation.navigate("Transactions");
        }, 1000);
      }
    } catch (error) {
      console.error('Swap error:', error);
      CustomInfoProvider.show("error", "!Opps", error.message || "Swap failed. Please try again");
    } finally {
      setSwapExecuting(false);
    }
  };

  const manageSwaps = async () => {
    setSwapExecuting(true)
    if (goWithGas === true) {
      await get1InchQoute()
    } else if (fromToken.chain !== toToken.chain) {
      const responses= await swapConfirmRoute(rangoQuoteInfo.requestId,rangoQuoteInfo.from.blockchain,rangoQuoteInfo.to.blockchain,fromToken.chain==="STR"?state.STELLAR_PUBLICK_KEY:state?.wallet?.address,toToken.chain==="STR"?state.STELLAR_PUBLICK_KEY:state?.wallet?.address);
      if (responses.status) {
        // Add tx approval before prepare tx//
        const swapPreparedTxRes= await swapPrepareTx(rangoQuoteInfo.requestId,responses?.response?.result?.result?.swaps?.length || 0)
        const hasError =Array.isArray(swapPreparedTxRes.response) &&swapPreparedTxRes.response.some(item => item?.ok === false);
        if (hasError) {
          const firstError = swapPreparedTxRes.response.find(item => item.ok === false);
          CustomInfoProvider.show("error","!Opps",firstError.error);
          setSwapExecuting(false);
        }else{
          if (swapPreparedTxRes.status) {
            const submitTx = await swapTxSign(CHAINS[fromToken.chain], fromToken.symbol === "STR" ? state.STELLAR_PUBLICK_KEY : state?.wallet?.address, swapPreparedTxRes.response)
            if (submitTx.status) {
              if (Array.isArray(submitTx.response.results) && submitTx.response.results.length > 0) {
                const validTxs = submitTx.response.results.filter(item => item.transactionHash);
                for (const tx of validTxs) {
                  await ShortTermStorage.saveTx(state?.wallet?.address, {
                    chain: fromToken.chain,
                    typeTx: "Swap",
                    status: "Pending",
                    hash: tx.transactionHash,
                  });
                }
                setSwapExecuting(false);
                CustomInfoProvider.show("success", "Swap Success", "Swap init successfully.");
                navigation.navigate("Transactions");
              }
            } else {
              setSwapExecuting(false);
              CustomInfoProvider.show("error", "!Opps", "Swap faild.");
            }
          }
        }
      } else {
        CustomInfoProvider.show("error", "!Opps", "Unable to confirm route");
        setSwapExecuting(false);
      }
    } else {
      await performeUniswap(amount, state?.wallet?.address)
    }
  }

  const ConfirmTx = ({
    visible,
    quote,
    onConfirm,
    onClose,
  }) => {
    const [confirming, setConfirming] = useState(false);
    const activePreset = quote.presets[quote.recommended_preset];
    const fromAmountRaw = parseFloat(ethers.utils.formatUnits(quote.fromTokenAmount, fromToken?.decimals));
    const toAmountRaw = parseFloat(ethers.utils.formatUnits(quote.toTokenAmount, toToken?.decimals));
    const toUSDRate = parseFloat(quote.prices.usd.toToken);
    const fromUSD = fromAmountRaw * parseFloat(quote.prices.usd.fromToken);
    const toUSD = toAmountRaw * toUSDRate;
    const feeAmountRaw = parseFloat(ethers.utils.formatUnits(activePreset.tokenFee, toToken?.decimals));
    const feeUSD = feeAmountRaw * toUSDRate;
    const minReceive = parseFloat(ethers.utils.formatUnits(activePreset.auctionEndAmount, toToken?.decimals));
    const handleConfirm = async () => {
      setConfirming(true);
      await onConfirm();
      setConfirming(false);
    };
    const Row = ({ label, value, subValue }) => (
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: theme.headingTx }]}>{label}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.rowValue, { color: theme.inactiveTx }]}>
            {value}
          </Text>
          {subValue ? <Text style={[styles.rowSubValue, { color: theme.inactiveTx }]}>{subValue}</Text> : null}
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
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

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

          {providerQuoteInfo === null ? <ActivityIndicator color={theme.cardSubTx} size={"large"} /> : <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={[styles.swapCard, { backgroundColor: theme.cardBg }]}>
              <View style={styles.tokenRow}>
                <View style={styles.tokenInfo}>
                  <View style={styles.tokenIcon}>
                    <Image source={{ uri: fromToken?.logoURI }} style={[styles.logoImage]} />
                  </View>
                  <View>
                    <Text style={[styles.tokenLabel, { color: theme.headingTx }]}>You pay</Text>
                    <Text style={[styles.tokenSymbol, { color: theme.headingTx }]}>{fromToken?.symbol}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.tokenAmount, { color: theme.headingTx }]}>
                    {fromAmountRaw}
                  </Text>
                  <Text style={[styles.tokenUSD, { color: theme.inactiveTx }]}>{formatUSD(fromUSD)}</Text>
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
                    <Image source={{ uri: toToken?.logoURI }} style={[styles.logoImage, { marginRight: 5 }]} />
                  </View>
                  <View>
                    <Text style={[styles.tokenLabel, { color: theme.headingTx }]}>You receive</Text>
                    <Text style={[styles.tokenSymbol, { color: theme.headingTx }]}>{toToken?.symbol}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.tokenAmount, { color: theme.headingTx }]}>
                    {toAmountRaw}
                  </Text>
                  <Text style={[styles.tokenUSD, { color: theme.inactiveTx }]}>{formatUSD(toUSD)}</Text>
                </View>
              </View>
            </View>

            {parseFloat(quoteInfo.outputAmount) > parseFloat(minReceive) && <View style={[styles.warningBanner, { backgroundColor: theme.cardBg, borderColor: theme.inactiveTx }]}>
              <Text style={[styles.warningText, { color: "#f19c5bff" }]}>We found a better rout for this swap.</Text>
            </View>}

            <View style={[styles.detailsCard, { backgroundColor: theme.cardBg }]}>
              <Row
                label="Provider"
                value={`1inch`}
              />
              <Row
                label="Rate"
                value={`1 ${fromToken?.symbol} = ${(toAmountRaw / fromAmountRaw)} ${toToken?.symbol}`}
              />
              <View style={[styles.divider, { backgroundColor: theme.smallCardBorderColor }]} />
              <Row
                label="Min. received"
                value={`${minReceive} ${toToken?.symbol}`}
              />
              <View style={[styles.divider, { backgroundColor: theme.smallCardBorderColor }]} />
              <Row
                label="Network fee"
                value={`${feeAmountRaw} ${toToken?.symbol}`}
                subValue={`≈ ${formatUSD(feeUSD)}`}
              />
              <View style={[styles.divider, { backgroundColor: theme.smallCardBorderColor }]} />
              <Row
                label="Price impact"
                value={`${quote.priceImpactPercent}%`}
              />
              <View style={[styles.divider, { backgroundColor: theme.smallCardBorderColor }]} />
              <Row
                label="Time"
                value={formatDuration(activePreset.auctionDuration)}
              />
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, confirming && { opacity: 0.7 }]}
              onPress={handleConfirm}
              disabled={confirming}
              activeOpacity={0.85}
            >
              {confirming
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.confirmBtnText, { color: theme.headingTx }]}>Confirm swap</Text>
              }
            </TouchableOpacity>
          </ScrollView>}
        </View>
      </Modal>
    );
  }

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
          />
          <TextInput
            maxLength={30}
            returnKeyType="done"
            style={styles.input}
            value={amount}
            onChangeText={(text) => { handleAmount(text) }}
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
          />
          {!quoteInfo.isFullNull && (
            <View style={styles.quoteTextCon}>
              <Text style={styles.quoteText}>≈</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.quoteText}>{quoteInfo.outputAmount}</Text>
              </ScrollView>
              <Text style={styles.quoteText}>{quoteInfo.toToken}</Text>
            </View>
          )}
        </View>
        <ChainSupportedToken
          visible={showTokenSelection}
          onclose={() => { setshowTokenSelection(false) }}
          selectedToken={(item) => {
            if (selectingFor === "from") {
              setFromToken(item)
              handleTokenBalance(item.address, item.chain===CHAINS["STR"].symbol?state?.STELLAR_PUBLICK_KEY:state?.wallet?.address, item.chain, true,item)
            } else {
              handleTokenBalance(item.address, item.chain===CHAINS["STR"].symbol?state?.STELLAR_PUBLICK_KEY:state?.wallet?.address, item.chain, false,item)
              setToToken(item)
            }
            setshowTokenSelection(showTokenSelection ? false : true);
          }}
          showOnlyEvm={false}
          showDataType={"swapEnable"}
        />
      </View>
      {qoutesLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4052D6" />
          <Text style={styles.loadingText}>Getting best quote...</Text>
        </View>
      )}
      {!quoteInfo.isFullNull && (
        <View style={styles.quoteDetailsContainer}>
          <View style={styles.quoteRow}>
          <Text style={styles.quoteTitle}>Estimated Quote Details</Text>
          <View style={styles.timerCon}>
            <Icon name={"time"} size={18} color={theme.inactiveTx} />
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
            <Text style={styles.quoteLabel}>Fee Tier</Text>
            <Text style={styles.quoteValue}>{quoteInfo.feeTire}</Text>
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Network Fee</Text>
            <View style={{ width: wp(25), flexDirection: "row" }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.quoteValue}>{quoteInfo.networkFee}</Text>
              </ScrollView>
              <Text style={styles.quoteValue}> {quoteInfo.fromChain}</Text>
            </View>
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Minimum Received</Text>
            <View style={{ width: wp(25), flexDirection: "row" }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.quoteValue}>{quoteInfo.minimumReceive}</Text>
              </ScrollView>
              <Text style={styles.quoteValue}> {quoteInfo.toToken}</Text>
            </View>
          </View>

          {quoteInfo.provider!=="Rango"&&<View style={styles.quoteRow}>
            <Text style={[styles.quoteLabel, { fontSize: 16 }]}>Go with gas less</Text>
            <View style={{ alignSelf: "flex-end" }}>
              <ToggleSwitch
                isOn={goWithGas}
                onColor="green"
                offColor="gray"
                size="small"
                onToggle={() => {
                  setgoWithGas(goWithGas ? false : true);
                }}
              />
            </View>
          </View>}

          <Text style={styles.disclaimerText}>
            * This transaction may include extra fees if it involves multiple hops.
          </Text>
        </View>
      )}
      <TouchableOpacity style={styles.swapButtonCon} disabled={btnDisable || swapExecuting}
        onPress={async () => {manageSwaps()}}
      >
        {swapExecuting ? (<ActivityIndicator color="#fff" />) : (<Text style={styles.swapButtonConText}>{btnMessage}</Text>)}
      </TouchableOpacity>
      </ScrollView>

      {providerQuoteInfo !== null && <ConfirmTx visible={visibleConfirmation}
        quote={providerQuoteInfo}
        onClose={() => { setSwapExecuting(false), setVisibleConfirmation(false) }}
        onConfirm={async () => { setVisibleConfirmation(false), await handleSwap() }}
      />}
    </View>
  )

};

export default EthSwap;