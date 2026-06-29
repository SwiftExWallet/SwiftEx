import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Animated,
  BackHandler,
  NativeModules,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Modal from "react-native-modal";
import { useSelector } from "react-redux";
import { ShowErrotoast, Showsuccesstoast } from "../../../../reusables/Toasts";
import Icon from "../../../../../icon";
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useIsFocused } from '@react-navigation/native';
import { STELLAR_URL } from "../../../../constants";
import { useToast } from "native-base";
import { Exchange_screen_header } from "../../../../reusables/ExchangeHeader";
import StellarAccountReserve from "../utils/StellarReserveComponent";
import { GetStellarAvilabelBalance, GetStellarUSDCAvilabelBalance, stellarWalletStatus } from "../../../../../utilities/StellarUtils";
import InfoComponent from "./InfoComponent";
import WalletActivationComponent from "../utils/WalletActivationComponent";
import CustomOrderBook from "../pages/stellar/CustomOrderBook";
import AMMSwap from "../pages/stellar/AMMSwap";
import InstentTradeHistory from "../pages/stellar/InstentTradeHistory";
import * as StellarSdk from '@stellar/stellar-sdk';
import { colors } from "../../../../../Screens/ThemeColorsConfig";
import stellarTokens from "../pages/stellar/Tokens.json";
import OneTapComponet from "./OneTapComponet";
import CustomInfoProvider from "./CustomInfoProvider";
import CrossChainTx from "./CrossChainTx";
// Initialize Stellar server
const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);

// Error messages configuration
const ERROR_MESSAGES = {
  INVALID_VALUE: "Invalid value",
  INSUFFICIENT_BALANCE: "Insufficient Balance",
  ACTIVATION_REQUIRED: "Activation Required",
  INPUT_CORRECT_VALUE: "Input Correct Value.",
  SELL_OFFER_NOT_CREATED: "Request Faild",
  BUY_OFFER_NOT_CREATED: "Request Faild",
  XLM_LOW_RESERVE: "XLM low reserve in account",
  LOW_RESERVE: (asset) => `${asset} low reserve in account`,
  OPPOSING_ORDER: "Account already has an active offer with an Opposing order",
  TRUSTLINE_SUCCESS: "Trustline updated successfully",
  TRUSTLINE_FAILED: "Trustline failed to update",
  UNABLE_TO_GET_MARKET_PRICE: "Unable to get market price.",
  INSUFFICIENT_FUNDS: "Insufficient funds",
  CREATE_OFFER: "Place Order",
  MULTIOP_OFFER: "Trust & Place Order",
};

// Success messages configuration
const SUCCESS_MESSAGES = {
  SELL_OFFER_CREATED: "Request created.",
  BUY_OFFER_CREATED: "Request created.",
};

// Tab configuration
const TAB_CONFIG = {
  INSTANT_TRADE: { id: 1, label: "Instant Swap", iconName:"lightning-bolt" },
  LARGE_ORDER_TRADE: { id: 0, label: " Trade", iconName:"chart-timeline-variant" },
};

const SUB_TAB_CONFIG = {
  TRADE: { id: 0, label: "Swap" },
  OVERVIEW: { id: 1, label: "Overview" },
  TRANSACTIONS: { id: 4, label: "Details" },
  // ORDERBOOK: { id: 2, label: "Orderbook" },
  LAST_TRADE: { id: 3, label: "Details" },
};

export const NewOfferModal = () => {
  const toast = useToast();
  const navigation = useNavigation();
  const back_data = useRoute();
  const isFocused = useIsFocused();
  const state = useSelector((state) => state);
  const [chooseSearchQuery, setChooseSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(SUB_TAB_CONFIG.TRADE.id);
  const [activeTradeType, setactiveTradeType] = useState(TAB_CONFIG.LARGE_ORDER_TRADE.id);
  const [selectedValue, setSelectedValue] = useState(tradingPairsConfig.PAIRS[0].base_value);
  const [SelectedBaseValue, setSelectedBaseValue] = useState(tradingPairsConfig.PAIRS[0].counter_value);
  const [Balance, setbalance] = useState('');
  const [offer_amount, setoffer_amount] = useState('');
  const [offer_price, setoffer_price] = useState('');
  const [route, setRoute] = useState(stellarConfig.TRADE_TYPES.SELL);
  const [btnRoot, setbtnRoot] = useState(0);
  const [Loading, setLoading] = useState(false);
  const [show_trust_modal, setshow_trust_modal] = useState([]);
  const [titel, settitel] = useState("UPDATING..");
  const [reserveLoading, setreserveLoading] = useState(false);
  const [chooseModalPair, setchooseModalPair] = useState(false);
  const [priceType, setpriceType] = useState(0);
  const [reservedError, setreservedError] = useState(false);
  const [infoVisible, setinfoVisible] = useState("");
  const [infotype, setinfotype] = useState("success");
  const [infomessage, setinfomessage] = useState("");
  const [assetInfo, setassetInfo] = useState(false);
  const [ACTIVATION_MODAL_PROD, setACTIVATION_MODAL_PROD] = useState(false);
  const [showOneTap,setshowOneTap]=useState(false);
  const [top_value, settop_value] = useState(tradingPairsConfig.PAIRS[0].visible_0);
  const [top_value_0, settop_value_0] = useState(tradingPairsConfig.PAIRS[0].visible_1);
  const [top_domain, settop_domain] = useState(tradingPairsConfig.PAIRS[0].asset_dom);
  const [top_domain_0, settop_domain_0] = useState(tradingPairsConfig.PAIRS[0].asset_dom_1);
  const [AssetIssuerPublicKey, setAssetIssuerPublicKey] = useState(tradingPairsConfig.PAIRS[0].visible0Issuer);
  const [AssetIssuerPublicKey1, setAssetIssuerPublicKey1] = useState(tradingPairsConfig.PAIRS[0].visible1Issuer);
  const [tradePriceLoading,settradePriceLoading]=useState(false);
  const theme = useMemo(() => state.THEME?.THEME ? colors.dark : colors.light, [state.THEME?.THEME]);
  const apiController = useRef(null);
  const debounceTimer = useRef(null);

  const safeCall = async (fn) => {
    if (apiController.current) apiController.current.abort();
    apiController.current = new AbortController();

    try {
      return await fn(apiController.current.signal);
    } catch (e) {
      if (e.name === "AbortError") return null;
      throw e;
    }
  };
  const chooseFilteredItemList = useMemo(() => 
    tradingPairsConfig.PAIRS.filter(item => 
      item.name.toLowerCase().includes(chooseSearchQuery.toLowerCase())
    ),
    [chooseSearchQuery]
  );

  const validateAmount = useCallback((amount) => {
    const parsed = parseFloat(amount);

    if (isNaN(parsed) || parsed < stellarConfig.VALIDATION.MIN_AMOUNT) {
      CustomInfoProvider.show("Invalid Amount",`Minimum amount allowed is ${stellarConfig.VALIDATION.MIN_AMOUNT}`);
      return false;
    }

    return true;
  }, []);


  const validatePrice = useCallback((price) => {
    const parsed = parseFloat(price);

    if (isNaN(parsed) || parsed < stellarConfig.VALIDATION.MIN_PRICE) {
     CustomInfoProvider.show("Invalid Price",`Minimum price allowed is ${stellarConfig.VALIDATION.MIN_PRICE}`);
      return false;
    }

    return true;
  }, []);


  const validateBalance = useCallback((amount, balance) => {
    return parseFloat(amount) <= parseFloat(balance);
  }, []);

  const createStellarAsset= (code, issuer) => {
  if (!code || code === "XLM" || code === "native") {
    return StellarSdk.Asset.native();
  }

  if (!issuer) {
    throw new Error(`Missing issuer for asset ${code}`);
  }

  return new StellarSdk.Asset(code, issuer);
};

  const handleTransactionError = useCallback((error, offerType) => {
    setoffer_amount('');
    console.log('Error occurred:', error.response ? error.response.data.extras.result_codes : error);
    
    const errMessage = error.response?.data?.extras?.result_codes?.operations?.join(', ') || "";
    
    let displayMessage = offerType === stellarConfig.TRADE_TYPES.SELL 
      ? ERROR_MESSAGES.SELL_OFFER_NOT_CREATED 
      : ERROR_MESSAGES.BUY_OFFER_NOT_CREATED;
    
    if (errMessage === stellarConfig.ERROR_CODES.LOW_RESERVE || errMessage === stellarConfig.ERROR_CODES.UNDERFUNDED) {
      displayMessage = SelectedBaseValue === stellarConfig.ASSET_TYPES.NATIVE 
        ? ERROR_MESSAGES.XLM_LOW_RESERVE 
        : ERROR_MESSAGES.LOW_RESERVE(SelectedBaseValue);
    } else if (errMessage === stellarConfig.ERROR_CODES.CROSS_SELF) {
      displayMessage = ERROR_MESSAGES.OPPOSING_ORDER;
    }
    
    ShowErrotoast(toast, displayMessage);
    setLoading(false);
  }, [SelectedBaseValue, toast]);

  const Sell = useCallback(async () => {
    try {
      const temp_amount = parseFloat(offer_amount);
      const temp_offer_price = parseFloat(offer_price);
      console.log("base:", show_trust_modal);

      if (!validateAmount(temp_amount) || !validatePrice(temp_offer_price)) {
        setLoading(false);
        ShowErrotoast(toast, ERROR_MESSAGES.INVALID_VALUE);
        return;
      }

      const account = await server.loadAccount(state.STELLAR_PUBLICK_KEY);
      const base_asset_sell = createStellarAsset(top_value, AssetIssuerPublicKey);
      const counter_asset_buy  = createStellarAsset(top_value_0, AssetIssuerPublicKey1);

      const offerTx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: stellarConfig.NETWORK
      })
      if (Array.isArray(show_trust_modal) && show_trust_modal.length > 0) {
        show_trust_modal.forEach(trustReq => {
          const asset =
            trustReq.code === "native" || trustReq.code === "XLM"
              ? StellarSdk.Asset.native()
              : new StellarSdk.Asset(trustReq.code, trustReq.issuer);
      
          offerTx.addOperation(
            StellarSdk.Operation.changeTrust({
              asset: asset
            })
          );
        });
      }
      offerTx.addOperation(
        StellarSdk.Operation.manageSellOffer({
        selling: base_asset_sell,
        buying: counter_asset_buy,
        amount: offer_amount,
        price: offer_price,
        offerId: stellarConfig.DEFAULT_OFFER_ID
      }))
      const tx = offerTx.setTimeout(stellarConfig.TRANSACTION_TIMEOUT).build();
      const txXDR = tx.toXDR();
      const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
      const signatureBuffer = Buffer.from(signedTx.signature, 'base64');
      tx.addSignature(signedTx.publicKey, signatureBuffer.toString('base64'));
      const offerResult = await server.submitTransaction(tx);
      
      console.log('Sell Offer placed:', offerResult.hash);
      Showsuccesstoast(toast, SUCCESS_MESSAGES.SELL_OFFER_CREATED);
      setLoading(false);
      navigation?.navigate(stellarConfig.NAVIGATION.STELLAR_OFFERS);
      
      return 'Request placed successfully';
    } catch (error) {
      console.debug("----err-or--",error)
      handleTransactionError(error, stellarConfig.TRADE_TYPES.SELL);
    }
  }, [offer_amount, offer_price, SelectedBaseValue, selectedValue, AssetIssuerPublicKey, AssetIssuerPublicKey1, validateAmount, validatePrice, createStellarAsset, toast, navigation, handleTransactionError]);

  const Buy = useCallback(async () => {
    try {
      const temp_amount = parseFloat(offer_amount);
      const temp_offer_price = parseFloat(offer_price);

      if (!validateAmount(temp_amount) || !validatePrice(temp_offer_price)) {
        setLoading(false);
        ShowErrotoast(toast, ERROR_MESSAGES.INVALID_VALUE);
        return;
      }

      const account = await server.loadAccount(state.STELLAR_PUBLICK_KEY);
      
      const base_asset_sell = createStellarAsset(top_value_0, AssetIssuerPublicKey1);
      const counter_asset_buy = createStellarAsset(top_value, AssetIssuerPublicKey);

      const offerTx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: stellarConfig.NETWORK
      })

      if (Array.isArray(show_trust_modal) && show_trust_modal.length > 0) {
        show_trust_modal.forEach(trustReq => {
          const asset =
            trustReq.code === "native" || trustReq.code === "XLM"
              ? StellarSdk.Asset.native()
              : new StellarSdk.Asset(trustReq.code, trustReq.issuer);

          offerTx.addOperation(
            StellarSdk.Operation.changeTrust({
              asset: asset
            })
          );
        });
      }     
        offerTx.addOperation(
          StellarSdk.Operation.manageBuyOffer({
            selling: counter_asset_buy,
            buying: base_asset_sell,
            buyAmount: offer_amount,
            price: offer_price,
            offerId: stellarConfig.DEFAULT_OFFER_ID
          })
        )
        const tx=offerTx.setTimeout(stellarConfig.TRANSACTION_TIMEOUT).build();
        const txXDR = tx.toXDR();
        const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
        const signatureBuffer = Buffer.from(signedTx.signature, 'base64');
        tx.addSignature(signedTx.publicKey, signatureBuffer.toString('base64'));
      const offerResult = await server.submitTransaction(tx);
      
      console.log('Buy Offer placed:', offerResult.hash);
      Showsuccesstoast(toast, SUCCESS_MESSAGES.BUY_OFFER_CREATED);
      setLoading(false);
      navigation?.navigate(stellarConfig.NAVIGATION.STELLAR_OFFERS);
      
      return 'Request placed successfully';
    } catch (error) {
      console.debug("error",error)
      handleTransactionError(error, stellarConfig.TRADE_TYPES.BUY);
    }
  }, [offer_amount, offer_price, top_value, top_value_0, AssetIssuerPublicKey, AssetIssuerPublicKey1, validateAmount, validatePrice, createStellarAsset, toast, navigation, handleTransactionError]);


  const checkAssetTrust = useCallback(async (asset) => {
    const currentWalletInfo = await server.loadAccount(state?.STELLAR_PUBLICK_KEY);
    const balances = currentWalletInfo?.balances ?? [];
    const existsAsset = balances.some((balance) => {
      if (asset === "XLM") {
        return balance.asset_type === "native";
      }
      return balance.asset_code === asset;
    });
    if (existsAsset){
      return  {assetStatus: true };
    } 
    const unavilabeAsset = stellarTokens.assets.find(
      (item) => item.code === asset
    );
    return { unavilabeAsset: unavilabeAsset, assetStatus: false }
  }, []);

  const get_stellar = useCallback(async (asset) => {
    return safeCall(async (signal) => {
      try {
        setbalance("");
        setreserveLoading(true);


        if (asset === stellarConfig.ASSET_TYPES.NATIVE || asset === stellarConfig.ASSET_TYPES.XLM) {
          const result = await GetStellarAvilabelBalance(
            state.STELLAR_PUBLICK_KEY,
            { signal }
          );
          if (!result) return;

          setbalance(result.availableBalance);
          setassetInfo(parseFloat(result.availableBalance) === 0);
        } else {
          const result = await GetStellarUSDCAvilabelBalance(
            state.STELLAR_PUBLICK_KEY,
            asset,
            asset?stellarConfig.ISSUERS[asset]:stellarConfig.ISSUERS.USDC,
            { signal }
          );
          if (!result) return;

          setbalance(result.availableBalance);
          setassetInfo(
            parseFloat(result.availableBalance) === 0 || result.status === false
          );
        }

        setreserveLoading(false);
      } catch (err) {
        setreserveLoading(false);
      }
    });
  }, [checkAssetTrust, state.STELLAR_PUBLICK_KEY]);

  const proceedToBridgeValidation = useCallback(async () => {
      // setassetInfo(false);
      setshowOneTap(true);
  }, [checkAssetTrust, navigation]);

  const offer_creation = useCallback(async() => { 
    const temp_amount = parseFloat(offer_amount);
    
    if (!validateBalance(temp_amount, Balance)) {
      ShowErrotoast(toast, ERROR_MESSAGES.INSUFFICIENT_BALANCE);
      setLoading(false);
      return;
    }

    
    const invalidInputs = [
      offer_amount === "",
      offer_price === "",
      offer_amount === "0",
      offer_price === "0",
      offer_amount === ".",
      offer_price === ".",
      offer_amount === ",",
      offer_price === ","
    ];

    if (titel !== stellarConfig.ACTIVATION_MESSAGE && !invalidInputs.some(Boolean)) {
      route === stellarConfig.TRADE_TYPES.SELL ? Sell() : Buy();
    } else {
      const message = titel === stellarConfig.ACTIVATION_MESSAGE 
        ? ERROR_MESSAGES.ACTIVATION_REQUIRED 
        : ERROR_MESSAGES.INPUT_CORRECT_VALUE;
      ShowErrotoast(toast, message);
      setLoading(false);
    }
  }, [checkAssetTrust, selectedValue, offer_amount, Balance, titel, offer_price, route, validateBalance, Sell, Buy, toast]);

  const getLastTradePrice = useCallback(async (codeA, issuerA, codeB, issuerB) => {
    return safeCall(async (signal) => {
      try {
        settradePriceLoading(true);

        const buying = codeA === "XLM" ? StellarSdk.Asset.native() : new StellarSdk.Asset(codeA, issuerA);
        const selling = codeB === "XLM" ? StellarSdk.Asset.native() : new StellarSdk.Asset(codeB, issuerB);

        const orderbook = await server.orderbook(buying, selling).call({ signal });
        if (!orderbook) return;

        const ask = parseFloat(orderbook.asks[0]?.price);
        const bid = parseFloat(orderbook.bids[0]?.price);
        const last = ((ask + bid) / 2).toFixed(7);

        setoffer_price(last);
        settradePriceLoading(false);
      } catch (e) {
        if (e.name !== "AbortError") console.log("Price error:", e);
        settradePriceLoading(false);
      }
    });
  }, []);

  const handleSuggest = useCallback((itemSuggest) => {
    if (Balance === "Error" || isNaN(Balance)) {
      setoffer_amount(stellarConfig.DEFAULT_AMOUNT);
      return;
    }
    
    const numericBalance = Number(Balance);
    const fraction = parseFloat(itemSuggest) / stellarConfig.PERCENTAGE_BASE;
    const newAmount = (numericBalance * fraction).toFixed(stellarConfig.AMOUNT_DECIMALS);
    setoffer_amount(newAmount);
  }, [Balance]);


  const reves_fun = () => {
    settop_value_0(top_value);
    settop_value(top_value_0);

    setAssetIssuerPublicKey1(AssetIssuerPublicKey);
    setAssetIssuerPublicKey(AssetIssuerPublicKey1);

    settop_domain(top_domain_0);
    settop_domain_0(top_domain);
  };

  const onChangename = useCallback((input) => {
    const replaceComma = input.replace(',', '.');
    const formattedInput = replaceComma.replace(stellarConfig.INPUT_SANITIZE_REGEX, '');
    setoffer_price(formattedInput);
  }, []);

  const onChangeamount = useCallback((input) => {
    const replaceComma = input.replace(',', '.');
    const formattedInput = replaceComma.replace(stellarConfig.INPUT_SANITIZE_REGEX, '');
    setoffer_amount(formattedInput);
  }, []);

  const handleCloseModal = useCallback(() => {
    setreservedError(false);
  }, []);

  const ActivateModal = useCallback(() => {
    setACTIVATION_MODAL_PROD(false);
    // navigation.goBack();
  }, [navigation]);

const selectTradingPair = useCallback((item) => {
  setchooseModalPair(false);

  settop_value(item.visible_0);
  settop_value_0(item.visible_1);

  setAssetIssuerPublicKey(item.visible0Issuer);
  setAssetIssuerPublicKey1(item.visible1Issuer);

  setSelectedValue(item.base_value);
  setSelectedBaseValue(item.counter_value);

  settop_domain(item.asset_dom);
  settop_domain_0(item.asset_dom_1);
}, []);

  const triggerMarketUpdate = useCallback(() => {
    setshow_trust_modal([]);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async() => {
      const walletStatus=await stellarWalletStatus(state?.STELLAR_PUBLICK_KEY)
      setACTIVATION_MODAL_PROD(walletStatus);
      checkToStatusTrust(top_value_0);
      getLastTradePrice(top_value, AssetIssuerPublicKey, top_value_0, AssetIssuerPublicKey1);
      get_stellar(top_value);
    }, 350);
  }, [
    top_value,
    top_value_0,
    AssetIssuerPublicKey,
    AssetIssuerPublicKey1,
    getLastTradePrice,
    get_stellar
  ]);

  const checkToStatusTrust = async (selectedValue) => {
    try {
      const hasAsset = await checkAssetTrust(selectedValue);
      if (!hasAsset.assetStatus) {
        setshow_trust_modal([...show_trust_modal, hasAsset.unavilabeAsset]);
      }
    } catch (error) {
      console.error("error in checkToStatusTrust",error);
    }
  }

  const chooseRenderItem = useCallback(({ item }) => (
    <TouchableOpacity 
      onPress={() => selectTradingPair(item)} 
      style={[styles.chooseItemContainer, {
        marginBottom: 2,
        paddingVertical: hp(1.5),
        backgroundColor: theme.cardBg,
        borderRadius: 15
      }]}
    >
      <Text style={[styles.chooseItemText, { color: theme.headingTx }]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  ), [theme.cardBg, theme.headingTx, selectTradingPair]);





  const isBalanceInsufficient = useMemo(() => {
    return Balance === "0.0000000" || parseFloat(Balance) === 0;
  }, [Balance]);

  const getAssetDisplayName = useCallback((asset) => {
    return asset === stellarConfig.ASSET_TYPES.NATIVE ? stellarConfig.ASSET_TYPES.XLM : asset;
  }, []);

  useEffect(() => {
    setshow_trust_modal([]);
    triggerMarketUpdate();
  }, [
    top_value,
    top_value_0,
    AssetIssuerPublicKey,
    AssetIssuerPublicKey1,
    isFocused
  ]);

  useEffect(() => {
    if (!back_data?.params?.tradeAssetType) {
      setactiveTradeType(TAB_CONFIG.INSTANT_TRADE.id);
    }
  }, [isFocused, back_data?.params?.tradeAssetType]);
  
  useEffect(() => {
  if (back_data?.params?.tradeAssetType && isFocused) {
    const assetType = back_data.params.tradeAssetType;
    const matchingPair = tradingPairsConfig.PAIRS.find(pair => 
      (pair.visible_0 === assetType && pair.visible_1 === "USDC") ||
      (pair.visible_1 === assetType && pair.visible_0 === "USDC")
    );
    
    if (matchingPair) {
      if (matchingPair.visible_0 === assetType) {
        settop_value(matchingPair.visible_0);
        settop_value_0(matchingPair.visible_1);
        setAssetIssuerPublicKey(matchingPair.visible0Issuer);
        setAssetIssuerPublicKey1(matchingPair.visible1Issuer);
        setSelectedValue(matchingPair.base_value);
        setSelectedBaseValue(matchingPair.counter_value);
        settop_domain(matchingPair.asset_dom);
        settop_domain_0(matchingPair.asset_dom_1);
      } else {
        settop_value(matchingPair.visible_1);
        settop_value_0(matchingPair.visible_0);
        setAssetIssuerPublicKey(matchingPair.visible1Issuer);
        setAssetIssuerPublicKey1(matchingPair.visible0Issuer);
        setSelectedValue(matchingPair.counter_value);
        setSelectedBaseValue(matchingPair.base_value);
        settop_domain(matchingPair.asset_dom_1);
        settop_domain_0(matchingPair.asset_dom);
      }
      setactiveTradeType(TAB_CONFIG.LARGE_ORDER_TRADE.id);
      setActiveTab(SUB_TAB_CONFIG.TRADE.id);
      setTimeout(() => {
        const assetCodeToCheck = assetType === "XLM" ? "native" : assetType;
        get_stellar(assetCodeToCheck);
        getLastTradePrice(
          assetType === "XLM" ? "native" : assetType,
          matchingPair.visible_0 === assetType ? matchingPair.visible0Issuer : matchingPair.visible1Issuer,
          "USDC",
          matchingPair.visible_1 === "USDC" ? matchingPair.visible1Issuer : matchingPair.visible0Issuer
        );
      }, 300);
      
    } else {
      const anyPair = tradingPairsConfig.PAIRS.find(pair => 
        pair.visible_0 === assetType || pair.visible_1 === assetType
      );
      if (anyPair) {
        console.log(`${assetType}/USDC pair not found, using ${anyPair.name}`);
        selectTradingPair(anyPair);
        // setTimeout(() => {
        //   CustomInfoProvider.show(
        //     "Trading Pair Info", 
        //     `${assetType}/USDC pair not available. Showing ${anyPair.name} instead.`
        //   );
        // }, 500);
      } else {
        console.log(`No trading pair found for ${assetType}`);
        // CustomInfoProvider.show(
        //   "Asset Not Found", 
        //   `No trading pair found for ${assetType}. Please select a pair manually.`
        // );
      }
    }
  }
}, [back_data?.params?.tradeAssetType, isFocused, selectTradingPair, get_stellar, getLastTradePrice]);

  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.timing(glow, {
          toValue: 2,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const borderColor = glow.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ["transparent", "#3b82f6", "#8b5cf6"],
  });

  useEffect(() => {
    const handleNativeBackAction = () => {
      if (showOneTap) {
        setshowOneTap(false);
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleNativeBackAction
    );
    return () => backHandler.remove();
  }, [showOneTap]);

  useFocusEffect(
    useCallback(() => {
      setshowOneTap(false);
    }, [])
  );

  return (
    <View style={[styles.scrollView0, { backgroundColor: theme.bg }]}>
      <Exchange_screen_header 
        title="" 
        onLeftIconPress={() => {showOneTap?setshowOneTap(false):navigation.goBack()}} 
        onRightIconPress={() => console.log('Pressed')} 
      />
        
      <View style={[styles.tradeContainer, { backgroundColor: theme.cardBg }]}>
        <TouchableOpacity
          style={[
            styles.tradetab, 
            activeTradeType === TAB_CONFIG.INSTANT_TRADE.id && [
              styles.tradeactiveTab, 
              { backgroundColor: "#4f5dc8ff" }
            ]
          ]}
          onPress={() => {
            setActiveTab(SUB_TAB_CONFIG.TRADE.id);
            setactiveTradeType(TAB_CONFIG.INSTANT_TRADE.id);
          }}
        >
          <Icon name={TAB_CONFIG.INSTANT_TRADE.iconName} type={"materialCommunity"} size={19} color={"#F7CC49"} style={{ marginHorizontal: 4 }} />
          <Text style={[
            [styles.tabText, { color: theme.headingTx }], 
            activeTradeType === TAB_CONFIG.INSTANT_TRADE.id && styles.tradeactiveTabText
          ]}>
            {TAB_CONFIG.INSTANT_TRADE.label}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.tradetab, 
            activeTradeType === TAB_CONFIG.LARGE_ORDER_TRADE.id && [
              styles.tradeactiveTab, 
              { backgroundColor: "#4f5dc8ff" }
            ]
          ]}
          onPress={() => {
            setActiveTab(SUB_TAB_CONFIG.TRADE.id);
            setactiveTradeType(TAB_CONFIG.LARGE_ORDER_TRADE.id);
          }}
        >
          <Icon name={TAB_CONFIG.LARGE_ORDER_TRADE.iconName} type={"materialCommunity"} size={19} color={"#F7CC49"} style={{ marginHorizontal: 4 }} />
          <Text style={[
            [styles.tabText, { color: theme.headingTx }], 
            activeTradeType === TAB_CONFIG.LARGE_ORDER_TRADE.id && styles.tradeactiveTabText
          ]}>
            {TAB_CONFIG.LARGE_ORDER_TRADE.label}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabContainer, { backgroundColor: theme.bg }]}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === SUB_TAB_CONFIG.TRADE.id && styles.activeTab]} 
          onPress={() => setActiveTab(SUB_TAB_CONFIG.TRADE.id)}
        >
          <Text style={[
            styles.tabText, 
            activeTab === SUB_TAB_CONFIG.TRADE.id && [styles.activeTabText, { color: theme.headingTx }]
          ]}>
            {SUB_TAB_CONFIG.TRADE.label}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, activeTab === SUB_TAB_CONFIG.OVERVIEW.id && styles.activeTab]} 
          onPress={() => setActiveTab(SUB_TAB_CONFIG.OVERVIEW.id)}
        >
          <Text style={[
            styles.tabText, 
            activeTab === SUB_TAB_CONFIG.OVERVIEW.id && [styles.activeTabText, { color: theme.headingTx }]
          ]}>
            {SUB_TAB_CONFIG.OVERVIEW.label}
          </Text>
        </TouchableOpacity>
        
        {activeTradeType === TAB_CONFIG.INSTANT_TRADE.id && (
          <TouchableOpacity 
            style={[styles.tab, activeTab === SUB_TAB_CONFIG.TRANSACTIONS.id && styles.activeTab]} 
            onPress={() => setActiveTab(SUB_TAB_CONFIG.TRANSACTIONS.id)}
          >
            <Text style={[
              styles.tabText, 
              activeTab === SUB_TAB_CONFIG.TRANSACTIONS.id && [styles.activeTabText, { color: theme.headingTx }]
            ]}>
              {SUB_TAB_CONFIG.TRANSACTIONS.label}
            </Text>
          </TouchableOpacity>
        )}

        {activeTradeType === TAB_CONFIG.LARGE_ORDER_TRADE.id && (
          <>
            {/* <TouchableOpacity 
              style={[styles.tab, activeTab === SUB_TAB_CONFIG.ORDERBOOK.id && styles.activeTab]} 
              onPress={() => setActiveTab(SUB_TAB_CONFIG.ORDERBOOK.id)}
            >
              <Text style={[
                styles.tabText, 
                activeTab === SUB_TAB_CONFIG.ORDERBOOK.id && [styles.activeTabText, { color: theme.headingTx }]
              ]}>
                {SUB_TAB_CONFIG.ORDERBOOK.label}
              </Text>
            </TouchableOpacity> */}
            
            <TouchableOpacity 
              style={[styles.tab, activeTab === SUB_TAB_CONFIG.LAST_TRADE.id && styles.activeTab]} 
              onPress={() => setActiveTab(SUB_TAB_CONFIG.LAST_TRADE.id)}
            >
              <Text style={[
                styles.tabText, 
                activeTab === SUB_TAB_CONFIG.LAST_TRADE.id && [styles.activeTabText, { color: theme.headingTx }]
              ]}>
                {SUB_TAB_CONFIG.LAST_TRADE.label}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <ScrollView style={{ width: "99%" }}>
        
          <InfoComponent
            visible={infoVisible}
            type={infotype}
            message={infomessage}
            onClose={() => setinfoVisible(false)}
          />

          <View>
            <ScrollView contentContainerStyle={styles.scrollView}>
              {!showOneTap && (
                <Animated.View
                  style={[styles.glowContainer, { borderColor }]}
                >
                  <View style={[styles.informationContiner, { backgroundColor: theme.cardBg }]}>
                    <View >
                      <Text style={[styles.amountSugCon.amountSugCardText,{color:theme.headingTx}]}>
                        Add USDC to get started.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.amountSugCon.amountSugCard, { backgroundColor: theme.bg, paddingHorizontal: 16.9 }]}
                      onPress={proceedToBridgeValidation}
                    >
                      <Text style={[styles.amountSugCon.amountSugCardText,{color:theme.headingTx}]}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}
              {activeTab === SUB_TAB_CONFIG.TRADE.id && (
                showOneTap?<CrossChainTx />:
                activeTradeType === TAB_CONFIG.INSTANT_TRADE.id ? (
                  <AMMSwap FROM_TOKEN={back_data?.params?.fromToken} TO_TOKEN={back_data?.params?.toToken}/>
                ) : (
                  <>
                    {/* Pair selection container */}
                    <View style={[styles.pairSelectionCon, { backgroundColor: theme.cardBg }]}>
                      <View style={styles.pariViewCon}>
                        <TouchableOpacity style={[styles.pairNameCon, { backgroundColor: theme.bg }]}>
                          <Text style={[styles.pairNameText, { color: theme.headingTx }]}>
                            {top_value}
                          </Text>
                          <Text style={[styles.pairNameText.pairDomainText, { color: theme.inactiveTx }]}>
                            {top_domain}
                          </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          style={[styles.pairSwapCon, { backgroundColor: theme.bg }]} 
                          onPress={() => {
                            settop_domain(top_domain_0);
                            settop_value(top_value_0);
                            settop_domain_0(top_domain);
                            settop_value_0(top_value);
                            setAssetIssuerPublicKey(AssetIssuerPublicKey1);
                            setAssetIssuerPublicKey1(AssetIssuerPublicKey);
                          }}
                        >
                          <Icon name="swap" type={"antDesign"} size={25} color={"#4052D6"} />
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={[styles.pairNameCon, { backgroundColor: theme.bg }]}>
                          <Text style={[styles.pairNameText, { color: theme.headingTx }]}>
                            {top_value_0}
                          </Text>
                          <Text style={[styles.pairNameText.pairDomainText, { color: theme.inactiveTx }]}>
                            {top_domain_0}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      
                      <TouchableOpacity 
                        style={[styles.pairSelectionSubCon, { backgroundColor: theme.bg }]} 
                        onPress={() => setchooseModalPair(true)}
                      >
                        <Text style={[styles.pairSelectionSubCon.pairSelectionName, { color: theme.headingTx }]}>
                          {top_value} 
                                <Icon name={"arrow-right"} type={"materialCommunity"} size={19} color={theme.headingTx} style={{ marginHorizontal: 10 }} />
                           {top_value_0}
                        </Text>
                        <Icon name="down" type={"antDesign"} size={20} color={theme.headingTx} />
                      </TouchableOpacity>
                    </View>

                    {/* Account info container */}
                    <View style={[
                      styles.pairSelectionCon, 
                      { backgroundColor: theme.cardBg, flexDirection: "row", alignItems: "center" }
                    ]}>
                      <View style={[
                        styles.accountInfoCon, 
                        { flexDirection: "column", maxWidth: wp(55), minWidth: wp(55), alignItems: "flex-start" }
                      ]}>
                        <View style={{ flexDirection: "row" }}>
                            <Text style={[styles.pairHeadingText, { color: theme.inactiveTx }]}>
                              Account : 
                            </Text>
                            <View style={{ width: wp(40) }}>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: wp(35) }}>
                                <Text 
                                  style={[styles.accountInfoCon.accountInfoText, { color: theme.headingTx }]} 
                                  numberOfLines={1}
                                >
                                  {state.STELLAR_PUBLICK_KEY}
                                </Text>
                              </ScrollView>
                            </View>
                          </View>
                          
                          <View style={{ flexDirection: "row" }}>
                              <Text style={[styles.pairHeadingText, { color: theme.inactiveTx }]}>
                                Balance :
                              </Text>
                            {reserveLoading ? (
                              <ActivityIndicator color={"green"} />
                            ) : (
                                  <Text
                                    style={[styles.accountInfoCon.accountInfoText, { color: theme.headingTx }]}
                                    numberOfLines={1}
                                  >
                                    {Balance === "Error"
                                      ? stellarConfig.DEFAULT_AMOUNT
                                      : Balance === undefined
                                        ? stellarConfig.DEFAULT_AMOUNT
                                        : Number(Balance)}
                                  </Text>
                            )}
                          </View>
                        </View>
                         
                        <View style={styles.offerSelctionCon}>
                          <TouchableOpacity 
                            style={[
                              styles.offerSelctionBtn, 
                              { 
                                backgroundColor: btnRoot === 0 ? "#4052D6" : theme.bg,
                                borderTopRightRadius: 0,
                                borderBottomRightRadius: 0 
                              }
                            ]} 
                            onPress={() => {
                              setRoute(stellarConfig.TRADE_TYPES.SELL);
                              setbtnRoot(0);
                              reves_fun()
                            }}
                          >
                            <Text style={[
                              styles.pairSelectionSubCon.pairSelectionName,
                              { color: btnRoot === 0 ? "#fff" : theme.headingTx }
                            ]}>
                              Send
                            </Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity 
                            style={[
                              styles.offerSelctionBtn,
                              { 
                                backgroundColor: btnRoot === 1 ? "#4052D6" : theme.bg,
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0 
                              }
                            ]} 
                            onPress={() => {
                              setRoute(stellarConfig.TRADE_TYPES.BUY);
                              setbtnRoot(1);
                              reves_fun()
                            }}
                          >
                            <Text style={[
                              styles.pairSelectionSubCon.pairSelectionName,
                              { color: btnRoot === 1 ? "#fff" : theme.headingTx }
                            ]}>
                              Receive
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
  
                      {/* Amount input */}
                      <View style={[styles.pairSelectionCon, { backgroundColor: theme.cardBg }]}>
                          <View style={[styles.amountSubinfo,{left:0,justifyContent:"space-between",width:wp(86)}]}>
                            <View style={styles.amountSubinfo}>
                              <Text style={[styles.pairHeadingText]}>Amount </Text>
                              <Text style={{ color: theme.headingTx, fontSize: 16, fontWeight: "500", marginLeft: wp(1) }}>
                                Swap {getAssetDisplayName(top_value)}
                                <Icon name={"arrow-right"} type={"materialCommunity"} size={19} color={theme.headingTx} style={{ marginHorizontal: 4 }} />
                                {getAssetDisplayName(top_value_0)}</Text>
                            </View>
                          </View>
                      
                        
                        <View style={[styles.amountInputCon, { backgroundColor: theme.bg }]}>
                          <TextInput  
                            style={[styles.textInputForCrossChain, { color: theme.headingTx, fontSize: 15 }]}
                            keyboardType="numeric"
                            returnKeyType="done"
                            value={offer_amount}
                            contextMenuHidden={true}
                            disableFullscreenUI={true}
                            placeholder={"Enter "+getAssetDisplayName(top_value)+" amount"}
                            placeholderTextColor={"gray"}
                            onChangeText={(text) => {
                              onChangeamount(text);
                              if (parseFloat(text) > parseFloat(Balance)) {
                                setinfoVisible(true);
                                setinfotype("error");
                                setinfomessage("Inputed Balance not found in account.");
                              }
                            }}
                            disabled={isBalanceInsufficient}
                            autoCapitalize={"none"}
                          />
                        </View>
                        
                        <View style={styles.amountDiv}>
                          {stellarConfig.AMOUNT_SUGGESTIONS.map((item, index) => (
                            <TouchableOpacity 
                              key={index}
                              style={[styles.amountSugCon.amountSugCard, { backgroundColor: theme.bg }]} 
                              onPress={() => handleSuggest(item.amountSuggest)}
                            >
                              <Text style={[styles.amountSugCon.amountSugCardText, { color: theme.headingTx }]}>
                                {item.amountSuggest}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
  
                        <View style={styles.priceCon}>
                          <View style={[styles.amountSubinfo]}>
                            <Text style={[styles.pairHeadingText]}>Conversion Rate </Text>
                          </View>
                          
                          <View style={styles.priceMangerCon}>
                            <TouchableOpacity 
                              style={[
                                styles.offerSelctionBtn, 
                                { 
                                  backgroundColor: priceType === 0 ? "#4052D6" : theme.bg,
                                  borderTopRightRadius: 0,
                                  borderBottomRightRadius: 0,
                                  width: wp(28)
                                }
                              ]} 
                              onPress={async () => {
                                setpriceType(0);
                                await getLastTradePrice(top_value, AssetIssuerPublicKey, top_value_0, AssetIssuerPublicKey1);
                              }}
                            >
                              <Text style={[
                                styles.pairSelectionSubCon.pairSelectionName,
                                { color: priceType === 0 ? "#fff" : theme.headingTx }
                              ]}>
                                Market Rate
                              </Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity 
                              style={[
                                styles.offerSelctionBtn,
                                { 
                                  backgroundColor: priceType === 1 ? "#4052D6" : theme.bg,
                                  borderTopLeftRadius: 0,
                                  borderBottomLeftRadius: 0,
                                  width: wp(28)
                                }
                              ]} 
                              onPress={() => {
                                setpriceType(1);
                                setoffer_price('');
                              }}
                            >
                              <Text style={[
                                styles.pairSelectionSubCon.pairSelectionName,
                                { color: priceType === 1 ? "#fff" : theme.headingTx }
                              ]}>
                                 Limit Rate
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        
                        <View style={[styles.amountInputCon, { backgroundColor: theme.bg }]}>
                          <TextInput 
                            style={[styles.textInputForCrossChain, { color: theme.headingTx, fontSize: 15 }]}
                            returnKeyType="done"
                            keyboardType="numeric"
                            value={isNaN(offer_price)?0.0:offer_price}
                            contextMenuHidden={true}
                            disableFullscreenUI={true}
                            placeholder={"0.0"}
                            placeholderTextColor={"gray"}
                            onChangeText={onChangename}
                            autoCapitalize={"none"}
                            disabled={isBalanceInsufficient}
                          />
                        </View>
                      </View>
  
                      {/* Total view */}
                      <View style={[styles.priceInfoCon, { backgroundColor: theme.cardBg }]}>
                        <View style={styles.amountSubinfo}>
                          <Text style={[styles.pairHeadingText]}>Total </Text>
                        </View>
                        <Text 
                          style={[styles.accountInfoCon.accountInfoText, { fontWeight: "900", color: theme.headingTx }]} 
                          numberOfLines={1}
                        >
                          {isNaN(offer_price)?0.0:offer_price * offer_amount}
                        </Text>
                      </View>
  
                      {/* Create offer button */}
                      <View style={{ display: "flex", alignSelf: "center" }}>
                        <StellarAccountReserve
                          isVisible={reservedError}
                          onClose={handleCloseModal}
                          title="Reserved"
                        />
                      </View>
  
                      <TouchableOpacity
                        activeOpacity={true}
                        style={[
                          styles.submitBtn,
                          { backgroundColor: Loading === true ? "gray" : "#4052D6" }
                        ]}
                        onPress={() => {
                          setLoading(true);
                          offer_creation();
                        }}
                        color="green"
                        disabled={Loading || isBalanceInsufficient}
                      >
                        <Text style={[styles.textColor, { color: "#fff" }]}>
                          {Loading === true ? (
                            <ActivityIndicator color={"white"} />
                          ) : assetInfo ? (
                            ERROR_MESSAGES.INSUFFICIENT_FUNDS
                          ) : (
                            show_trust_modal.length>0?ERROR_MESSAGES.MULTIOP_OFFER:ERROR_MESSAGES.CREATE_OFFER
                          )}
                        </Text>
                      </TouchableOpacity>


                    <Modal
                      animationType="slide"
                      transparent={true}
                      visible={chooseModalPair}
                    >
                      <TouchableOpacity 
                        style={[styles.chooseModalContainer]} 
                        onPress={() => setchooseModalPair(false)}
                      >
                        <View style={[styles.chooseModalContent, { backgroundColor: theme.bg }]}>
                          <Text style={[styles.chooseItem_text, { color: theme.headingTx }]}>
                            Select Swap Pair
                          </Text>
                          <FlatList
                            data={chooseFilteredItemList}
                            renderItem={chooseRenderItem}
                            keyExtractor={(item) => item.id.toString()}
                          />
                        </View>
                      </TouchableOpacity>
                    </Modal>
                  </>
                )
              )}
              
              {activeTab === SUB_TAB_CONFIG.OVERVIEW.id && (
                <View style={{ width: "100%" }}>
                  <CustomOrderBook visibleTabs={['chart']} />
                </View>
              )}
              
              {/* {activeTab === SUB_TAB_CONFIG.ORDERBOOK.id && (
                <View style={{ width: "100%" }}>
                  <CustomOrderBook visibleTabs={['bids']} />
                </View>
              )} */}
              
              {activeTab === SUB_TAB_CONFIG.LAST_TRADE.id && (
                <View style={{ width: "100%" }}>
                  <CustomOrderBook visibleTabs={['trades']} />
                </View>
              )}
              
              {activeTab === SUB_TAB_CONFIG.TRANSACTIONS.id && (
                <View style={{ width: "100%" }}>
                  <InstentTradeHistory />
                </View>
              )}
            </ScrollView>
          </View>
      </ScrollView>
      
      <WalletActivationComponent
        isVisible={ACTIVATION_MODAL_PROD}
        onClose={ActivateModal}
        onActivate={() => setACTIVATION_MODAL_PROD(false)}
        navigation={navigation}
        appTheme={true}
        shouldNavigateBack={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    height: hp("5%"),
    marginBottom: hp("2"),
    marginTop: hp("1"),
    borderBottomWidth: 1,
    width: wp(80),
    fontSize: 16
  },
  content: {
    display: "flex",
    alignItems: "center",
    textAlign: "center",
    justifyContent: "space-evenly",
    marginTop: hp("1"),
    color: "white",
  },
  addingText: {
    color: "#fff",
    fontSize: hp(3),
    borderRadius: 0,
    borderWidth: 0,
    marginVertical: hp(1),
    marginBottom: hp(5)
  },
  assetText: {
    color: "#fff",
    fontSize: hp(2),
    width: wp(25),
    marginLeft: -20,
  },
  currencyText: {
    color: "#fff",
    fontSize: hp(2),
    marginLeft: 7.6,

  },
  down_: {
    marginBottom: -16
  },
  dropdownText: {
    width: wp(28),
    borderColor: "#407EC9",
    borderBottomWidth: StyleSheet.hairlineWidth * 1,
  },
  dropdownContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: wp(70),
  },
  down: {
    marginBottom: -69
  },
  unitText: {
    color: "#fff",
    fontSize: hp(2),
    marginTop: hp(0),
  },
  inputContainer: {
    marginRight: wp(0),
    marginTop: hp(1)
  },
  balance: {
    color: "#fff",
    textAlign: "center",
    marginVertical: hp(2),
    fontSize: hp(2),
  },
  textColor: {
    fontSize: 16,
  },
  noteText: {
    color: "#fff",
    marginVertical: hp(3),
    marginHorizontal: wp(17),
    width: wp(58),
    color: "orange"
  },
  confirmButton: {
    alignItems: "center",
    width: wp(30),
    borderRadius: 10,
    borderRadius: 9,
    backgroundColor: "#212B53",
    borderColor: "rgba(72, 93, 202, 1)rgba(67, 89, 205, 1)",
    borderWidth: 0.9,
  },
  cancelButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth * 1,
    borderColor: "green",
    width: wp(23),
    paddingVertical: hp(0.7),
    borderRadius: 6,
    backgroundColor: 'green',
  },
  BuyButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth * 1,
    borderColor: "green",
    width: wp(23),
    paddingVertical: hp(1),
    borderRadius: 6,
    margin: 1,
    marginTop: 48,
    backgroundColor: 'green',
    height: 40
  },
  Buttons: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: hp(3),
    justifyContent: "center",
    alignSelf: "center",
    width: wp(100),
  },
  cancelText: {
    color: "white",
  },
  crossIcon: {
    alignSelf: "flex-end",
    padding: hp(1)
  },
  toggleContainer: {
    alignSelf: "center",
    marginVertical: hp(3),
    borderColor: "#407EC9",
    borderWidth: StyleSheet.hairlineWidth * 1,
    flexDirection: "row",
    borderRadius: 8,
  },
  toggleBtn: {
    width: wp(43),
    justifyContent: "space-around",
    alignItems: "center",
    height: hp(6),
    flexDirection: "row",
    alignSelf: "center",
  },
  toggleBtn2: {
    width: wp(43),
    height: hp(6),
    borderRadius: 8,
    justifyContent: "space-around",
    alignItems: "center",
    flexDirection: "row",
    alignSelf: "center",
  },
  headerContainer1_TOP: {
    backgroundColor: "#4CA6EA",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    width: wp(100),
    paddingHorizontal: wp(2),
  },
  logoImg_TOP: {
    height: hp("8"),
    width: wp("12"),
    marginLeft: wp(14),
  },
  text_TOP: {
    color: "white",
    fontSize: 19,
    fontWeight: "bold",
    alignSelf: "center",
    marginStart: wp(27)
  },
  text1_ios_TOP: {
    alignSelf: "center",
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    paddingTop: hp(3),

  },
  background_1: {
    height: '100%',
    borderWidth: 2,
    borderColor: 'transparent',
    marginTop: 15,
    marginBottom: 5
  },
  frame_1: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10
  },
  text_1: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalContainer_option_top: {
    alignSelf: "flex-end",
    alignItems: 'center',
    width: "100%",
    height: "60%",
  },
  modalContainer_option_sub: {
    alignSelf: "flex-end",
    backgroundColor: 'rgba(33, 43, 83, 1)',
    padding: 10,
    borderRadius: 10,
    width: "65%",
    height: "70%"
  },
  modalContainer_option_view: {
    flexDirection: "row",
    marginTop: 25,
    alignItems: "center",
  },
  modalContainer_option_text: {
    fontSize: 20,
    fontWeight: "bold",
    color: "gray",
    marginStart: 5
  },
  chooseModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: -20
  },
  chooseModalContent: {
    backgroundColor: 'rgba(33, 43, 83, 1)',
    paddingVertical: 5,
    paddingHorizontal: 20,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    width: wp(99),
    maxHeight: '80%',
    borderColor: 'rgba(72, 93, 202, 1)rgba(67, 89, 205, 1)',
    borderTopWidth: 3,
  },
  chooseItem_text: {
    color: "#fff",
    fontSize: 21,
    textAlign: "left",
    marginVertical: hp(2),
    fontWeight: "500"
  },
  searchInput: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
    color: "#fff"
  },
  chooseItemContainer: {
    marginVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  chooseItemText: {
    marginLeft: 10,
    fontSize: 19,
  },
  slipage_1: {
    margin: 5,
    alignItems: "center",
    width: wp(15),
    borderColor: "'rgba(72, 93, 202, 1)rgba(67, 89, 205, 1)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    marginBottom: 15
  },
  scrollView: {
    flexGrow: 1,
    alignItems: "center"
  },
  scrollView0: {
    flex: 1,
    alignItems: "center",
  },
  pariViewCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "center",
    alignItems: "center",
    width: "98%",
  },
  pairNameCon: {
    width: wp(32),
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 5
  },
  pairSwapCon: {
    width: wp(10.5),
    height: hp(5),
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 30,
    borderColor: "#4052D6",
    borderWidth: 1
  },
  pairNameText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "400",
    pairDomainText: {
      color: "#818895",
      fontSize: 13,
    }
  },
  pairHeadingText: {
    color: "#818895",
    fontSize: 14,
    marginLeft: 3
  },
  pairSelectionCon: {
    flexDirection: "column",
    justifyContent: "space-between",
    backgroundColor: "#141C2B",
    alignItems: "flex-start",
    borderRadius: 20,
    width: wp(93),
    maxWidth: wp(95),
    paddingVertical: hp(2),
    paddingHorizontal: wp(2.5),
    marginHorizontal: wp(2.5),
    marginVertical: hp(0.6)
  },
  pairSelectionSubCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    marginTop: hp(1.9),
    borderRadius: 16,
    padding: 21,
    pairSelectionName: {
      fontSize: 16,
      color: "#FFFFFF"
    }
  },
  offerSelctionCon: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    pairSelectionName: {
      fontSize: 16,
      color: "#FFFFFF"
    }
  },
  offerSelctionBtn: {
    width: wp(16),
    paddingVertical: hp(1),
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  accountInfoCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    accountInfoText: {
      fontSize: 13,
    }
  },
  amountCon: {
    width: "98%",
    height: 71,
    marginTop: "3%",
    gap: 2,
  },
  amountSubinfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    left: 4
  },
  amountInputCon: {
    paddingHorizontal: 5,
    paddingVertical: hp(0.5),
    justifyContent: "center",
    alignItems: "flex-start",
    width: "100%",
    borderRadius: 10,
    marginTop: hp(1)
  },
  amountSugCon: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6.9,
    paddingHorizontal: 15,
    amountSugCard: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 6,
      paddingHorizontal:6,
      borderRadius: 8,
      backgroundColor: "#141C2B",
    },
    amountSugCardText: {
      color: "#FFFFFF",
      fontSize: 16
    }
  },
  priceInfoCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "gray",
    alignSelf: "center",
    borderRadius: 20,
    width: wp(93),
    maxWidth: wp(95),
    paddingVertical: hp(2),
    paddingHorizontal: wp(2.5),
    marginHorizontal: wp(2.5),
    marginVertical: hp(1.5)
  },
  submitBtn: {
    paddingHorizontal: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: hp(1),
    width: "95%",
    paddingVertical: hp(2.3),
    borderRadius: 15,
    marginBottom: "10%",
    alignSelf: "center",
    backgroundColor: "#2164C1",
    submitBtnText: {
      fontSize: 17,
      fontWeight: "3400",
      color: "#FFFFFF"
    }
  },
  informationContiner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: wp(92),
    height: hp(6.9),
    borderRadius: 16,
    paddingHorizontal: 13,
  },
  infoBtnCon: {
    alignItems: "center",
    justifyContent: "center",
    width: 80,
    height: 33,
    borderRadius: 8,
    backgroundColor: "gray",
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#011434',
    alignSelf: "center",
    marginBottom: "2%",
    width: "98%",
  },
  tradeContainer: {
    flexDirection: 'row',
    alignSelf: "center",
    marginBottom: "2%",
    width: "96%",
    marginTop: "2%",
    paddingVertical: hp(1),
    paddingHorizontal: wp(2),
    borderRadius: 10,
    justifyContent: "space-between",
    alignItems: "center"
  },
  tradetab: {
    width: wp(45),
    paddingVertical: hp(1.6),
    alignItems: 'center',
    justifyContent: "center",
    flexDirection:"row"
  },
  tradeactiveTab: {
    width: wp(45),
    borderRadius: 10
  },
  tradeactiveTabText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#4052D6',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15
  },
  tabText: {
    fontSize: 15,
    color: 'gray',
    fontWeight: '500',
  },
  activeTabText: {
    color: 'white',
    fontWeight: '500',
  },
  amountDiv: {
    flexDirection: "row",
    alignSelf: "center",
    justifyContent:"space-around",
    marginTop: 13,
    width:wp(90)
  },
  textInputForCrossChain: {
    width: "100%",
    paddingHorizontal: wp(2),
    paddingVertical: Platform.OS == "android" ? hp(1) : hp(2),
  },
  priceCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    alignItems: "center",
    marginTop: hp(2),
  },
  priceMangerCon: {
    flexDirection: "row",
    alignItems: "center",
    pairSelectionName: {
      fontSize: 16,
      color: "#FFFFFF"
    }
  },
  glowContainer: {
    borderWidth: 1.5,
    borderRadius: 18,
    marginVertical: hp(0.5)
  },
});

export const stellarConfig = {
  NETWORK: StellarSdk.Networks.PUBLIC,
  TRANSACTION_TIMEOUT: 30,
  DEFAULT_OFFER_ID: 0,
  ANIMATION_DURATION: 1500,
  VALIDATION: {
    MIN_AMOUNT: 0.0000001,
    MIN_PRICE: 0.0000001,
  },
  PRICE_DECIMALS: 7,
  BALANCE_DECIMALS: 7,
  AMOUNT_DECIMALS: 7,
  PERCENTAGE_BASE: 100,
  DEFAULT_AMOUNT: "0.00000",
  ASSET_TYPES: {
    NATIVE: "native",
    XLM: "XLM",
    USDC: "USDC",
    ETH: "ETH",
    BTC: "BTC",
  },
 SUPPORTED_ASSETS: ["USDC", "ETH", "BTC"],
  ISSUERS: {
    USDC: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    ETH: "GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC",
    BTC: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM",
  },
  TRADE_TYPES: {
    SELL: "SELL",
    BUY: "BUY",
  },
  ERROR_CODES: {
    LOW_RESERVE: "op_low_reserve",
    UNDERFUNDED: "op_underfunded",
    CROSS_SELF: "op_cross_self",
  },
  NAVIGATION: {
    STELLAR_OFFERS: "StellarOffers",
    CLASSIC: "classic",
  },
  ACTIVATION_MESSAGE: "Activate Stellar Account for trading",
  INPUT_SANITIZE_REGEX: /[,\s-]/g,
  AMOUNT_SUGGESTIONS: [
    { id: 1, amountSuggest: "25%" },
    { id: 2, amountSuggest: "50%" },
    { id: 3, amountSuggest: "75%" },
    { id: 4, amountSuggest: "100%" },
  ],
};
export const tradingPairsConfig = {
  PAIRS: [
    { 
      id: 1, 
      name: "XLM/USDC", 
      base_value: "USDC", 
      counter_value: "native", 
      visible_0: "XLM", 
      visible_1: "USDC", 
      asset_dom: "steller.org", 
      asset_dom_1: "centre.io", 
      visible0Issuer: null, 
      visible1Issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" 
    },
    { 
      id: 2, 
      name: "ETH/BTC", 
      base_value: "BTC", 
      counter_value: "ETH", 
      visible_0: "ETH", 
      visible_1: "BTC", 
      asset_dom: "ultracapital.xyz", 
      asset_dom_1: "ultracapital.xyz", 
        visible0Issuer: "GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC", 
      visible1Issuer: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM" 
    },
    { 
      id: 3, 
      name: "ETH/USDC", 
      base_value: "USDC", 
      counter_value: "ETH", 
      visible_0: "ETH", 
      visible_1: "USDC", 
      asset_dom: "ultracapital.xyz", 
      asset_dom_1: "centre.io", 
       visible0Issuer: "GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC", 
      visible1Issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" 
    },
    { 
      id: 4, 
      name: "BTC/ETH", 
      base_value: "ETH", 
      counter_value: "BTC", 
      visible_0: "BTC", 
      visible_1: "ETH", 
      asset_dom: "ultracapital.xyz", 
      asset_dom_1: "ultracapital.xyz", 
      visible0Issuer: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM", 
      visible1Issuer: "GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC" 
    },
    { 
      id: 5, 
      name: "XLM/BTC", 
      base_value: "BTC", 
      counter_value: "native", 
      visible_0: "XLM", 
      visible_1: "BTC", 
      asset_dom: "steller.org", 
      asset_dom_1: "ultracapital.xyz", 
      visible0Issuer: null, 
      visible1Issuer: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM" 
    },
    { 
      id: 6, 
      name: "USDC/BTC", 
      base_value: "BTC", 
      counter_value: "USDC", 
      visible_0: "USDC", 
      visible_1: "BTC", 
      asset_dom: "centre.io", 
      asset_dom_1: "ultracapital.xyz", 
      visible0Issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", 
      visible1Issuer: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM" 
    },
  ]
};