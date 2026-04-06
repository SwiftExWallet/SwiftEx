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
  NativeModules
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

const EthSwap = () => {
  const navigation = useNavigation();
  const state = useSelector((state) => state);
  const [errorVisible, setErrorVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fromToken, setFromToken] = useState(null);
  const [toToken, setToToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [quoteInfo, setQuoteInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTokenList, setShowTokenList] = useState(false);
  const [selectingFor, setSelectingFor] = useState('from');
  const [fromTokenBalance, setFromTokenBalance] = useState('0.00');
  const [toTokenBalance, setToTokenBalance] = useState('0.00');
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [btnMessage, setbtnMessage] = useState("Swap");
  const [btnDisable, setbtnDisable] = useState(true);
  const [swapExecuting, setSwapExecuting] = useState(false);
  const [currentNetwork, setCurrentNetwork] = useState(TemporaryTokens[1].symbol);
  const [visibleConfirmation, setVisibleConfirmation] = useState(false);
  const [providerQuoteInfo, setProviderQuoteInfo] = useState(null);
  const abortControllerRef = useRef(null);
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const [goWithGas, setgoWithGas] = useState(false);

  const getSwapQuote = useCallback(async (tokenIn, tokenOut, amountIn, type) => {
    if(!tokenIn||!tokenOut)
    {
      CustomInfoProvider.show("warning", "!Opps", "Please choose the “From” and “To” network for swap.");
      return null;
    }
    if (tokenIn.chain !== tokenOut.chain) {
      CustomInfoProvider.show("warning", "!Opps", "Please choose the same network for both “From” and “To”.");
      return null;
    }
    try {
      const { res, err } = await proxyRequest(
        `/v1/quoter/quote`, 
        PPOST, 
        { 
          tokenIn: tokenIn.address, 
          tokenOut: tokenOut.address, 
          amount: ethers.utils.parseUnits(amountIn,tokenIn.decimals).toString(),
          chain:type
        }
      );
      
      if (err?.status) {
        setErrorMessage(err.message || 'Failed to get quote. Please try again.');
        setErrorVisible(true);
        return null;
      }
      
      return res;
    } catch (error) {
      console.error('Quote error:', error);
      setErrorMessage('Network error. Please check your connection.');
      setErrorVisible(true);
      return null;
    }
  }, []);

  const getProviderQoute=async()=>{
        try {
      const { res, err } = await proxyRequest(
        `/v1/swap/1inch/getSwapQuote`, 
        PPOST, 
        { 
          tokenIn: fromToken.address, 
          tokenOut: toToken.address, 
          amount: ethers.utils.parseUnits(amount,fromToken?.decimals).toString(),
          walletAddress: state?.wallet?.address,
          chain: currentNetwork
        }
      );
      
      if (err?.status) {
        setErrorMessage(err.message || 'Failed to get quote. Please try again.');
        setErrorVisible(true);
        return null;
      }
      setProviderQuoteInfo(res);
      setVisibleConfirmation(true)
      setSwapExecuting(false);
    } catch (error) {
      console.error('Quote error:', error);
      setErrorMessage('Network error. Please check your connection.');
      setErrorVisible(true);
      setSwapExecuting(false);
      return null;
    }
  }

  const fetchTokenBalances = useCallback(async (token0Addr, token1Addr, network) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setBalanceLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const walletAddress = state?.wallet?.address;
      if (!walletAddress) return;

      const addresses = [token0Addr, token1Addr];
      let responseBalance;
        responseBalance = await getTokenBalancesUsingAddress(addresses, walletAddress,network, {
          signal: controller.signal
        });
        if(responseBalance.status){
          setFromTokenBalance(parseFloat(responseBalance?.tokenInfo?.[0]?.balance || 0));
          setToTokenBalance(parseFloat(responseBalance?.tokenInfo?.[1]?.balance || 0));
        }
    } catch (error) {
      console.error("Error fetching BSC token balance:", error);
      Snackbar.show({
        text: "Unable to fetch balance",
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: '#ff6b6b',
      });
    } finally {
      setBalanceLoading(false);
    }
  }, [state?.wallet?.address]);

  const debouncedFetchBalances = useCallback(
    debounce((token0Addr, token1Addr, network) => {
      fetchTokenBalances(token0Addr, token1Addr, network.toLowerCase());
    }, 400),
    [fetchTokenBalances]
  );

  // Update quote when amount changes
  useEffect(() => {
    let timeoutId;

    const updateQuote = async () => {
      if (!amount || parseFloat(amount) <= 0) {
        setQuoteInfo(null);
        setbtnDisable(true);
        setbtnMessage("Enter amount");
        return;
      }

      setLoading(true);
      
      try {
        const quote = await getSwapQuote(fromToken, toToken, amount, currentNetwork.toLowerCase());
        
        if (quote) {
          if(quote.success){
            setQuoteInfo(quote.data);
          }
          
          // Validate balance
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
      } catch (error) {
        console.error('Update quote error:', error);
        setQuoteInfo(null);
        setbtnDisable(true);
        setbtnMessage("Quote failed");
      } finally {
        setLoading(false);
      }
    };

    // Debounce quote updates
    timeoutId = setTimeout(() => {
      updateQuote();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [amount, fromToken, toToken, currentNetwork, fromTokenBalance, getSwapQuote]);

  // Fetch balances when tokens change
  useEffect(() => {
    if (balanceLoading) return;
    debouncedFetchBalances(fromToken?.address, toToken?.address, currentNetwork);
    return () => {
      debouncedFetchBalances.cancel();
    };
  }, [fromToken?.address, toToken?.address, currentNetwork]);

  // Token selector component
  const TokenSelector = ({ token, onPress, balance }) => (
    <TouchableOpacity 
      disabled={balanceLoading || loading}
      style={[
        styles.tokenSelector,
        { backgroundColor: theme.bg,opacity: balanceLoading || loading ? 0.7 : 1}
      ]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.tokenContainer, { width: wp(30) }]}>
        {!token ?
          <Text style={[styles.tokenSymbol, { color: theme.headingTx, fontSize: 16 }]}>Select Network</Text> :
          <>
            <Image source={{ uri: token?.logoURI }} style={[styles.logoImage, { marginRight: 5 }]} />
            <View>
              <Text style={[styles.tokenSymbol, { color: theme.headingTx }]}>
                {token?.symbol}
              </Text>
              <Text style={[styles.tokenChainSymbol, { color: theme.inactiveTx }]}>
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

  // Token list modal
  const TokenListModal = () => {
    const handleTokenSelect = useCallback((item) => {
      if (balanceLoading) {
        Snackbar.show({
          text: "Please wait for balances to load",
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: '#ff6b6b',
        });
        return;
      }

      setShowTokenList(false);
      
      requestAnimationFrame(() => {
        if (selectingFor === 'from' && item.address !== toToken?.address) {
          setCurrentNetwork(item.chain);
          setFromToken(item);
        } else if (selectingFor === 'to' && item.address !== fromToken?.address) {
          setCurrentNetwork(item.chain);
          setToToken(item);
        } else {
          Snackbar.show({
            text: "Cannot select same token twice",
            duration: Snackbar.LENGTH_SHORT,
            backgroundColor: '#ff6b6b',
          });
        }
      });
    }, [selectingFor, fromToken?.address, toToken?.address, balanceLoading]);

    return (
      <ChainSupportedToken
        visible={showTokenList}
        onclose={() => { setShowTokenList(false) }}
        selectedToken={(item) => {
          handleTokenSelect(item)
        }} />
    );
  };

  // Handle amount input
  const handleChange = (text, decimals) => {
    const replaceComma = text.replace(',', '.');
    const numericText = replaceComma.replace(/[^0-9.]/g, '');
    setAmount(numericText);
  };

  // Swap tokens
  const tokenHandle = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromTokenBalance(toTokenBalance);
    setToTokenBalance(fromTokenBalance);
  };


const formatUSD = (value) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(num);
};

const formatDuration = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
};

const Row = ({ label, value, subValue }) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel,{color:theme.headingTx}]}>{label}</Text>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={[styles.rowValue,{color:theme.inactiveTx}]}>
        {value}
      </Text>
      {subValue ? <Text style={[styles.rowSubValue,{color:theme.inactiveTx}]}>{subValue}</Text> : null}
    </View>
  </View>
);

  


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

        <View style={[styles.sheet,{backgroundColor:theme.bg}]}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={[styles.headerTitle,{color:theme.headingTx}]}>Confirm swap</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
            <Icon name="close-circle-outline" size={26} color={theme.headingTx} />
            </TouchableOpacity>
          </View>

          {providerQuoteInfo===null?<ActivityIndicator color={theme.cardSubTx} size={"large"}/>:<ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={[styles.swapCard,{backgroundColor:theme.cardBg}]}>
              <View style={styles.tokenRow}>
                <View style={styles.tokenInfo}>
                  <View style={styles.tokenIcon}>
                    <Image source={{ uri: fromToken?.logoURI }} style={[styles.logoImage]} />
                  </View>
                  <View>
                    <Text style={[styles.tokenLabel,{color:theme.headingTx}]}>You pay</Text>
                    <Text style={[styles.tokenSymbol,{color:theme.headingTx}]}>{fromToken?.symbol}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.tokenAmount,{color:theme.headingTx}]}>
                    {fromAmountRaw}
                  </Text>
                  <Text style={[styles.tokenUSD,{color:theme.inactiveTx}]}>{formatUSD(fromUSD)}</Text>
                </View>
              </View>

              <View style={styles.arrowWrap}>
                <View style={[styles.arrowLine,{backgroundColor:theme.headingTx}]} />
                <View style={[styles.arrowCircle,{borderColor:theme.headingTx}]}>
                  <Text style={[styles.arrowIcon,{color:theme.headingTx}]}>↓</Text>
                </View>
                <View style={[styles.arrowLine,{backgroundColor:theme.headingTx}]} />
              </View>

              <View style={styles.tokenRow}>
                <View style={styles.tokenInfo}>
                  <View style={styles.tokenIcon}>
                    <Image source={{ uri: toToken?.logoURI }} style={[styles.logoImage, { marginRight: 5 }]} />
                  </View>
                  <View>
                    <Text style={[styles.tokenLabel,{color:theme.headingTx}]}>You receive</Text>
                    <Text style={[styles.tokenSymbol,{color:theme.headingTx}]}>{toToken?.symbol}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.tokenAmount, { color: theme.headingTx}]}>
                    {toAmountRaw}
                  </Text>
                  <Text style={[styles.tokenUSD,{color:theme.inactiveTx}]}>{formatUSD(toUSD)}</Text>
                </View>
              </View>
            </View>

            {parseFloat(quoteInfo.allQuotes[0].amountOutFormatted)>parseFloat(minReceive)&&<View style={[styles.warningBanner,{backgroundColor:theme.cardBg,borderColor:theme.inactiveTx}]}>
              <Text style={[styles.warningText,{color:"#f19c5bff"}]}>We found a better rout for this swap.</Text>
            </View>}

            <View style={[styles.detailsCard,{backgroundColor:theme.cardBg}]}>
               <Row
                label="Provider"
                value={`1inch`}
              />
              <Row
                label="Rate"
                value={`1 ${fromToken?.symbol} = ${(toAmountRaw / fromAmountRaw)} ${toToken?.symbol}`}
              />
              <View style={[styles.divider,{backgroundColor:theme.smallCardBorderColor}]} />
              <Row
                label="Min. received"
                value={`${minReceive} ${toToken?.symbol}`}
              />
              <View style={[styles.divider,{backgroundColor:theme.smallCardBorderColor}]} />
              <Row
                label="Network fee"
                value={`${feeAmountRaw} ${toToken?.symbol}`}
                subValue={`≈ ${formatUSD(feeUSD)}`}
              />
              <View style={[styles.divider,{backgroundColor:theme.smallCardBorderColor}]} />
              <Row
                label="Price impact"
                value={`${quote.priceImpactPercent}%`}
              />
              <View style={[styles.divider,{backgroundColor:theme.smallCardBorderColor}]} />
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
                : <Text style={[styles.confirmBtnText,{color:theme.headingTx}]}>Confirm swap</Text>
              }
            </TouchableOpacity>
          </ScrollView>}
        </View>
      </Modal>
    );
  }

  // Execute swap
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
          quote:providerQuoteInfo,
          tokenIn: fromToken.address, 
          tokenOut: toToken.address, 
          amount: ethers.utils.parseUnits(amount,fromToken?.decimals).toString(),
          walletAddress: state?.wallet?.address,
          chain: currentNetwork
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
        currentNetwork.toLowerCase(),
        state?.wallet?.address,
        typedDataJson,
      );
       console.error("result",typeof(result.signature))
      const submitResult = await proxyRequest("/v1/swap/1inch/submitOrder", PPOST, {
        "chain": currentNetwork,
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
      console.error("submitResult",submitResult)
      if (submitResult.err?.status) {
        Snackbar.show({
          text: submitResult.message || "Swap failed",
          duration: Snackbar.LENGTH_LONG,
          backgroundColor: '#ff6b6b',
        });
      } else {
        Snackbar.show({
          text: "Swap successful!",
          duration: Snackbar.LENGTH_LONG,
          backgroundColor: '#51cf66',
        });
        setTimeout(() => {
          navigation.navigate("Transactions");
        }, 1000);
      }
    } catch (error) {
      console.error('Swap error:', error);
      Snackbar.show({
        text: error.message || "Swap failed. Please try again",
        duration: Snackbar.LENGTH_LONG,
        backgroundColor: '#ff6b6b',
      });
    } finally {
      setSwapExecuting(false);
    }
  };

  // Swap execution function
  const swapForEth = async (amount, address) => {
    try {

      const payload = {
        tokenIn: fromToken,
        tokenOut: toToken,
        amount: amount,
        recipient: address,
        chainId:currentNetwork
      };

      const respo = await proxyRequest("/v1/quoter/swap", PPOST, payload);

      if (respo.err?.status) {
        return {
          status: false,
          message: respo.err.message || "Failed to prepare swap",
        };
      }

      const rawTxs = respo.res.data;
      
      if (!rawTxs || rawTxs.length === 0) {
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
          console.error(`Sign error:`, signError);
          return {
            status: false,
            message: "Transaction signing failed",
          };
        }
      }
      
      const { res, err } = await proxyRequest("/v1/eth/swap-transaction/execute", PPOST, { txs: signedTxs,broadcastChain:currentNetwork });

      if (err?.status) {
        return {
          status: false,
          message: err.message || "Broadcast failed",
        };
      }

      if (Array.isArray(res) && res.length > 0) {
        const validTxs = res.filter(item => item?.txResponse?.hash);
        
        for (const tx of validTxs) {
          await ShortTermStorage.saveTx(state?.wallet?.address, {
            chain: currentNetwork,
            typeTx: "Swap",
            status: "Pending",
            hash: tx.txResponse.hash,
          });
        }
        setSwapExecuting(false);
        CustomInfoProvider.show('success',"Swap","Swap completed successfully");
        return {
          status: true,
          message: "Swap completed successfully",
        };
      }
      setSwapExecuting(false);
      CustomInfoProvider.show('error',"Swap","Swap execution faild");
      return {
        status: false,
        message: "No transaction hash received",
      };
    } catch (error) {
      setSwapExecuting(false);
      CustomInfoProvider.show('error',"Swap","Swap execution faild");
      console.error("Swap execution error:", error);
      return {
        status: false,
        message: error.message || "Swap failed",
      };
    }
  };

  // Bnb Swap execution function
  const swapBnb = async (amount, address) => {
    try {

      const payload = {
        tokenIn: fromToken,
        tokenOut: toToken,
        amount: amount,
        recipient: address,
        slippage: 1,
      };

      console.log("Preparing BSC swap:", payload);

      const respo = await proxyRequest("/v1/bsc/swap-transaction/prepare", PPOST, payload);

      if (respo.err?.status) {
        return {
          status: false,
          message: respo.err.message || "Failed to prepare swap",
        };
      }

      const rawTxs = respo.res;

      if (!rawTxs || rawTxs.length === 0) {
        return {
          status: false,
          message: "No transactions to sign",
        };
      }

      console.log(`Signing ${rawTxs.length} transaction(s)...`);
      const signedTxs = [];

      for (let i = 0; i < rawTxs.length; i++) {
        const tx = rawTxs[i];

        const formattedTx = {
          chainId: parseInt(tx.chainId) || 56,
          to: tx.to,
          nonce: ethers.utils.hexlify(Number(tx.nonce)),
          gasPrice: ethers.utils.hexlify(Number(tx.gasPrice)),
          gasLimit: ethers.utils.hexlify(Number(tx.gasLimit)),  // 🔧 MAIN FIX
          value: ethers.utils.hexlify(ethers.BigNumber.from(tx.value || 0)),
          data: tx.data?.startsWith("0x") ? tx.data : "0x" + (tx.data || ""),
        };

        console.log(`Signing tx ${i + 1}:`, {
          to: formattedTx.to,
          nonce: formattedTx.nonce,
          gasLimit: formattedTx.gasLimit.toString(),
          gasPrice: formattedTx.gasPrice.toString(),
          value: formattedTx.value.toString(),
        });

        try {
        const signedTx = await NativeModules.TransactionSigner.signTransaction(
            "bsc",
            address,
            JSON.stringify(formattedTx),
            56
          );

          let rawTx = signedTx.signedTx;
          if (rawTx.startsWith("0x0x")) {
            rawTx = rawTx.replace(/^0x/, "");
          }
          signedTxs.push(rawTx);
          console.log(`Transaction ${i + 1}/${rawTxs.length} signed`);
        } catch (signError) {
          console.log(`Sign error for tx ${i}:`, signError);
          return {
            status: false,
            message: `Transaction ${i + 1} signing failed: ${signError.shortMessage || signError.message}`,
          };
        }
      }

      console.log("Broadcasting BSC transactions...");
      const broadcastPayload = signedTxs.length === 1
        ? { signedTx: signedTxs[0] }
        : { signedTransactions: signedTxs };

      const { res, err } = await proxyRequest(
        "/v1/bsc/transaction/broadcast",
        PPOST,
        broadcastPayload
      );

      if (err?.status) {
        return {
          status: false,
          message: err.message || "Broadcast failed",
        };
      }

      console.log("Broadcast response:", res);

      if (res?.txHash) {
        await ShortTermStorage.saveTx(state?.wallet?.address, {
          chain: "BNB",
          typeTx: "Swap",
          status: "Pending",
          hash: res.txHash,
        });

        return {
          status: true,
          message: "Swap completed successfully",
          txHash: res.txHash,
        };
      }

      if (res?.success && res?.results && Array.isArray(res.results)) {
        console.log(`Saving ${res.results.length} transactions...`);

        for (let i = 0; i < res.results.length; i++) {
          const result = res.results[i];

          console.log(`Saving transaction ${i + 1}:`, {
            hash: result.transactionHash,
            type: result.type,
            status: result.status,
          });

          try {
            await ShortTermStorage.saveTx(state?.wallet?.address, {
              chain: "BNB",
              typeTx: result.type === 'approve' ? 'Approve' : 'Swap',
              status: "Pending",
              hash: result.transactionHash,
            });

            console.log(`Transaction ${i + 1} saved successfully`);
          } catch (saveError) {
            console.log(`Failed to save transaction ${i + 1}:`, saveError);
          }
        }

        console.log('All transactions saved');

        return {
          status: true,
          message: "Swap completed successfully",
          txCount: res.totalTransactions,
          results: res.results,
        };
      }

      return {
        status: false,
        message: "No transaction hash received",
      };
    } catch (error) {
      console.error("BSC swap execution error:", error);
      return {
        status: false,
        message: error.message || "BSC swap failed",
      };
    }
  };

  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      <Wallet_screen_header title="Swap" onLeftIconPress={() => navigation.goBack()} />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        <ErrorComponet
          isVisible={errorVisible}
          onClose={() => setErrorVisible(false)}
          message={errorMessage}
        />
        <View style={[styles.container, { backgroundColor: theme.bg }]}>
          {/* From Token */}
          <View style={[styles.card, { backgroundColor: theme.cardBg, marginTop: hp(1) }]}>
            <View style={styles.networkCon}>
              <Text style={styles.label}>From</Text>
            </View>
            <TokenSelector
              token={fromToken}
              onPress={() => {
                if (!balanceLoading && !loading) {
                  setSelectingFor('from');
                  setShowTokenList(true);
                }
              }}
              balance={fromTokenBalance}
            />
            <TextInput
              maxLength={30}
              returnKeyType="done"
              style={[
                styles.input,
                { 
                  backgroundColor: theme.bg,
                  color: theme.headingTx 
                }
              ]}
              value={amount}
              onChangeText={(text) => handleChange(text, fromToken?.decimals)}
              placeholder="0.0"
              keyboardType="decimal-pad"
              placeholderTextColor="#666"
            />
          </View>

          {/* Swap Button */}
          <TouchableOpacity 
            style={[styles.swapButton, { backgroundColor: theme.bg }]} 
            onPress={tokenHandle}
          >
            <Icon name="swap-vertical" size={24} color="#4052D6" />
          </TouchableOpacity>

          {/* To Token */}
          <View style={[styles.card, { backgroundColor: theme.cardBg, marginTop: -2 }]}>
            <View style={styles.networkCon}>
              <Text style={styles.label}>To</Text>
            </View>
            <TokenSelector
              token={toToken}
              onPress={() => {
                if (!balanceLoading && !loading) {
                  setSelectingFor('to');
                  setShowTokenList(true);
                }
              }}
              balance={toTokenBalance}
            />
            {quoteInfo && (
              <View style={[
                styles.quoteTextCon,
                { backgroundColor: theme.bg }
              ]}>
                <Text style={[styles.quoteText, { color: theme.headingTx }]}>
                  ≈
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text style={[styles.quoteText, { color: theme.headingTx }]}>
                    {quoteInfo.allQuotes[0].amountOutFormatted}
                  </Text>
                </ScrollView>
                <Text style={[styles.quoteText, { color: theme.headingTx }]}>
                  {quoteInfo.tokenOut.symbol}
                </Text>
              </View>
            )}
          </View>

          {/* Quote Details */}
          {quoteInfo && (
            <View style={[
              styles.quoteDetailsContainer,
              { backgroundColor: theme.cardBg }
            ]}>
              <Text style={[styles.quoteTitle, { color: theme.headingTx }]}>
                Estimated Quote Details
              </Text>
              
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Rate</Text>
                <Text style={[styles.quoteValue, { color: theme.headingTx }]}>
                  1 {quoteInfo.tokenIn.symbol} = {parseFloat(quoteInfo.allQuotes[0].pricePerToken).toFixed(6)} {quoteInfo.tokenOut.symbol}
                </Text>
              </View>

              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Fee Tier</Text>
                <Text style={[styles.quoteValue, { color: theme.headingTx }]}>
                  {quoteInfo.allQuotes[0].feeTierLabel}
                </Text>
              </View>

                <View style={styles.quoteRow}>
                  <Text style={styles.quoteLabel}>Network Fee</Text>
                   <View style={{ width: wp(25), flexDirection: "row" }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <Text style={[styles.quoteValue, { color: theme.headingTx }]}>
                      {quoteInfo.allQuotes[0].gasCostEth}
                    </Text>
                  </ScrollView>
                  <Text style={[styles.quoteValue, { color: theme.headingTx }]}>
                    {' '}{CHAINS[currentNetwork].symbol}
                  </Text>
                </View>
                </View>

              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Minimum Received</Text>
                <View style={{ width: wp(25), flexDirection: "row" }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <Text style={[styles.quoteValue, { color: theme.headingTx }]}>
                      {parseFloat(quoteInfo.allQuotes[0].minimumReceived)}
                    </Text>
                  </ScrollView>
                  <Text style={[styles.quoteValue, { color: theme.headingTx }]}>
                    {' '}{quoteInfo.tokenOut.symbol}
                  </Text>
                </View>
              </View>

              <View style={styles.quoteRow}>
                <Text style={[styles.quoteLabel,{fontSize:16}]}>Go with gas less</Text>
                <View style={{ alignSelf:"flex-end" }}>
                  <ToggleSwitch
                    isOn={goWithGas}
                    onColor="green"
                    offColor="gray"
                    size="small"
                    onToggle={() => {
                      setgoWithGas(goWithGas?false:true);
                    }}
                  />
                </View>
              </View>
              
              <Text style={[styles.disclaimerText, { color: state?.THEME?.THEME === false ? "#666" : "#888" }]}>
                * This transaction may include extra fees if it involves multiple hops.
              </Text>
            </View>
          )}

          {/* Loading */}
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4052D6" />
              <Text style={styles.loadingText}>Getting best quote...</Text>
            </View>
          )}

          {/* Swap Button */}
          <TouchableOpacity 
            style={[
              styles.swapButtonCon,
              { backgroundColor: btnDisable || swapExecuting ? "#666" : "#4052D6" }
            ]} 
            disabled={btnDisable || swapExecuting} 
            onPress={async()=>{setSwapExecuting(true),goWithGas===true?await getProviderQoute():await swapForEth(amount,state?.wallet?.address)}}
          >
            {swapExecuting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.swapButtonConText}>{btnMessage}</Text>
            )}
          </TouchableOpacity>
        </View>

        <TokenListModal />
      </ScrollView>
      {providerQuoteInfo!==null&&<ConfirmTx visible={visibleConfirmation}
        quote={providerQuoteInfo}
        onClose={()=>{setSwapExecuting(false),setVisibleConfirmation(false)}}
        onConfirm={async()=>{setSwapExecuting(false),await handleSwap()}}
      />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    alignSelf: "center",
    width: "100%",
    minHeight: hp(80),
  },
  card: {
    backgroundColor: '#F4F4F8',
    borderRadius: 16,
    paddingVertical: hp(1.5),
    paddingHorizontal: wp(3),
  },
  swapButton: {
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
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  tokenChainSymbol: {
    fontSize: 11,
    fontWeight: "800",
  },
  tokenBalance: {
    fontSize: 14,
    color: '#666',
    width: wp(50),
    textAlign: "right"
  },
  input: {
    fontSize: 24,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    color: '#000',
  },
  quoteTextCon: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  quoteText: {
    fontSize: 24,
    borderRadius: 8,
  },
  quoteDetailsContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  quoteTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: "black"
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
    color: "black"
  },
  disclaimerText: {
    fontSize: 12,
    color: '#666',
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
  modalContainer: {
    alignSelf:"center",
    justifyContent:"flex-end"
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  tokenListItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tokenListSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: "black"
  },
  tokenListName: {
    fontSize: 14,
    color: '#666',
  },
  closeButton: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginTop: 16,
  },
  closeButtonText: {
    fontSize: 16,
    color: 'black',
  },
  tokenContainer: {
    flexDirection: "row",
    alignItems: "center"
  },
  tokenDetaisContainer: {
    marginLeft: 10
  },
  logoImage: {
    height: hp(4),
    width: wp(8.5),
    borderRadius: hp(2),
  },
  swapButtonCon: {
    width: wp(90),
    backgroundColor: "#4052D6",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginTop: hp(2.5),
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 5,
    marginLeft: 10,
  },
  clearButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  resultsText: {
    fontSize: 12,
    marginBottom: 10,
    marginHorizontal: 15,
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  headerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: wp(2),
    borderRadius: 16,
  },
  assetInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: wp(3),
  },
  assetName: {
    fontSize: 20,
    fontWeight: "700",
  },
  assetSymbol: {
    fontSize: 14,
  },
  loadingBalanceText: {
    fontSize: 12,
    marginTop: 4,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    width:wp(100),
    alignSelf:"center"
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
  tokenSymbol: {
    fontSize: 15,
    fontWeight: '600',
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
    marginBottom:hp(1.5)
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
});

export default EthSwap;