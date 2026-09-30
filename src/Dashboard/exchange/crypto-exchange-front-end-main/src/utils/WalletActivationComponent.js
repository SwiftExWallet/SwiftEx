import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Animated, 
  Dimensions,
  Platform,
  BackHandler,
  ActivityIndicator,
  Image,
  NativeModules
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RAPID_STELLAR, SET_ASSET_DATA, WALLET_ACTIVATION_SHOW } from '../../../../../components/Redux/actions/type';
import { REACT_APP_HOST } from '../ExchangeConstants';
import Snackbar from 'react-native-snackbar';
import { ENVIRONMENT, STELLAR_FUNDING_PUBLIC_KEY, STELLAR_URL, STELLAR_USDC_ISSUER } from '../../../../constants';
import apiHelper from '../apiHelper';
import * as StellarSdk from '@stellar/stellar-sdk';
import Icon from '../../../../../icon';
import TokenQrCode from '../../../../Modals/TokensQrCode';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import stellarImg from "../../../../../../assets/Stellar_(XLM).png"
import { CHAINS } from '../../../../../utilities/TokenUtils';
import CustomInfoProvider from '../components/CustomInfoProvider';

const { height } = Dimensions.get('window');
const ACTIVATION_ASSET_SYMBOLS = ["USDC", "USDT"];
const ORIGIN_EXCLUDED_CHAIN_KEYS = ["STR"];
const MIN_STABLE_BALANCE_FOR_AUTOSELECT = 1;

function normalizeChain(chain) {
  return chain === "BNB" ? "BSC" : chain;
}

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

function pickDefaultFromPortfolio(portfolio, activationChains) {
  if (!Array.isArray(portfolio) || !portfolio.length) return null;

  let best = null;

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
    if (nativeBalance <= 0) continue;

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

const WalletActivationComponent = ({ 
  isVisible = false, 
  onClose, 
  onActivate, 
  appTheme,
  navigation = null,
  shouldNavigateBack = false
}) => {
    const dispatch_ = useDispatch()
    const state = useSelector((state) => state);
    const backHandler = useRef(null);
  const [Wallet_activation,setWallet_activation]=useState(false);
  const [visibleBuyUi,setVisibleBuyUi]=useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const isDarkMode = appTheme;

  const activationChains = React.useMemo(() => buildActivationChains(), []);
  const portfolioDefault = React.useMemo(
    () => pickDefaultFromPortfolio(state?.activeWalletPortFolio, activationChains),
    [state?.activeWalletPortFolio, activationChains]
  );
  
  // Use refs to avoid re-creating animation instances
  const animationRef = useRef(new Animated.Value(height));
  const animation = animationRef.current;
  
  // Use refs to track visible state to avoid race conditions
  const visibleRef = useRef(state.walletActivationShow&&isVisible?true:false);
  const [showSheet, setShowSheet] = useState(state.walletActivationShow&&isVisible?true:false);
  console.debug(state.walletActivationShow&&isVisible?true:false)
  // Prevent animation conflicts
  const animatingRef = useRef(false);

  // Theme colors
  const theme = {
    background: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    secondaryText: isDarkMode ? '#AAAAAA' : '#666666',
    accentColor: '#4F8EF7',
    accentBackground: isDarkMode ? '#2C3E50' : '#EBF2FF',
    handleColor: isDarkMode ? '#555555' : '#E0E0E0',
    backdropColor: 'rgba(0, 0, 0, 0.7)'
  };

  // Function to handle closing and navigation
  const handleClose = () => {
    dispatch_({
      type: WALLET_ACTIVATION_SHOW,
      payload: {
        walletActivationShow: false
      }
    });
    onClose();
  };

  useEffect(() => {
    const handleBackPress = () => {
        if (showSheet) {
            handleClose();
            return true;
        }
        return false;
    };

    backHandler.current = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => {
        backHandler.current?.remove();
    };
}, [showSheet, navigation, shouldNavigateBack]);

  // Optimized animation logic
  useEffect(() => {
    // Skip if no change
    if (visibleRef.current === isVisible) return;
    
    visibleRef.current = isVisible;
    
    // Prevent animation conflicts
    if (animatingRef.current) {
      animation.stopAnimation();
    }
    
    animatingRef.current = true;
    
    if (isVisible) {
      // Make sure component is rendered first
      setQrVisible(false);
      setVisibleBuyUi(true);
      setShowSheet(state.walletActivationShow&&isVisible?true:false);
      
      // Use requestAnimationFrame to avoid layout thrashing
      requestAnimationFrame(() => {
        Animated.timing(animation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          animatingRef.current = false;
        });
      });
    } else {
      Animated.timing(animation, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        animatingRef.current = false;
        setShowSheet(false);
      });
    }
  }, [isVisible]);

  if (!showSheet) return null;

  const active_account = async () => {
    try {
      const resultApi = await apiHelper.patch(
        `${REACT_APP_HOST}/v1/wallet/${state.STELLAR_PUBLICK_KEY}/activate-wallet`
      );
      console.info("result---xdr", resultApi);
      if (!resultApi?.success) {
        console.log("Error: Funding account failed.", resultApi);
        setWallet_activation(false);
        CustomInfoProvider.show('error', 'Oops! We could not claim your XLM.');
        if (
          resultApi?.status !== 200 &&
          resultApi?.status !== 201 &&
          resultApi?.success === false
        ) {
          setVisibleBuyUi(true);
        }

        return;
      }

      const xdr = resultApi?.data?.wallet?.xdr;

      if (!xdr) {
        throw new Error("Transaction XDR not found in API response");
      }

      const networkPassphrase =
    ENVIRONMENT === "TESTNET"
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC;

  const expectedFundingAccount = STELLAR_FUNDING_PUBLIC_KEY;
  const expectedUsdcIssuer = STELLAR_USDC_ISSUER;

  const transaction = StellarSdk.TransactionBuilder.fromXDR(
    xdr,
    networkPassphrase
  );

  const walletAddress = state.STELLAR_PUBLICK_KEY;

  if (
    !(transaction instanceof StellarSdk.Transaction) ||
    transaction.source !== expectedFundingAccount
  ) {
    throw new Error("Unexpected activation funding account");
  }

  const [createAccount, changeTrust] = transaction.operations;

  if (
    transaction.operations.length !== 2 ||
    createAccount?.type !== "createAccount" ||
    createAccount.destination !== walletAddress ||
    (createAccount.source ?? transaction.source) !== expectedFundingAccount ||
    changeTrust?.type !== "changeTrust" ||
    changeTrust.source !== walletAddress ||
    changeTrust.line.code !== "USDC" ||
    changeTrust.line.issuer !== expectedUsdcIssuer
  ) {
    throw new Error("Unexpected activation operations");
  }

  const signedTx = await NativeModules.StellarSigner.signTransaction(xdr);

  if (!signedTx?.signedXDR) {
    throw new Error("Native signer did not return signedXDR");
  }

  const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(
    signedTx.signedXDR,
    networkPassphrase
  );

  if (
    !(signedTransaction instanceof StellarSdk.Transaction) ||
    !signedTransaction.hash().equals(transaction.hash())
  ) {
    throw new Error("Signer changed the activation transaction");
  }

  // Verify both signatures, rather than checking signature count.
  const hash = signedTransaction.hash();

  for (const address of [expectedFundingAccount, walletAddress]) {
    const keypair = StellarSdk.Keypair.fromPublicKey(address);
    const valid = signedTransaction.signatures.some((signature) =>
      keypair.verify(hash, signature.signature())
    );

    if (!valid) {
      throw new Error(`Missing or invalid activation signature: ${address}`);
    }
  }

  const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);
  const result = await server.submitTransaction(signedTransaction);
      console.info("Activation transaction result:", result);
      if (!result?.successful) {
        throw new Error("Funding account failed");
      }
      const account = await server.loadAccount(state.STELLAR_PUBLICK_KEY);
      dispatch_({
        type: SET_ASSET_DATA,
        payload: account.balances,
      });
      dispatch_({
        type: RAPID_STELLAR,
        payload: {
          ETH_KEY: state.ETH_KEY,
          STELLAR_PUBLICK_KEY: state.STELLAR_PUBLICK_KEY,
          STELLAR_ADDRESS_STATUS: true,
        },
      });
      CustomInfoProvider.show("success", "Hurray", "Wallet Activated successfully.");
      setWallet_activation(false);
      onActivate();
    } catch (error) {
      console.error(
        "Wallet activation error:",
        error?.response?.data || error
      );

      if (error?.response?.data?.extras?.result_codes) {
        console.log(
          "STELLAR RESULT CODES:",
          error.response.data.extras.result_codes
        );
      }
      setWallet_activation(false);
      CustomInfoProvider.show('error', error?.response?.data?.extras?.result_codes?.transaction ===
            "tx_bad_auth"
            ? "Transaction signature is invalid for the selected Stellar network."
            : "Wallet activation failed.");
      handleClose();
    }
  };

  const ActivationHandle=async()=>{
    setWallet_activation(true)
    await active_account()
  }

  const HandleTokensBuy=()=>{
    navigation.navigate("KycComponent",{cryptoRequest:"XLM"});
  }

  return (
    <View style={[styles.container, StyleSheet.absoluteFill]}>
      <TouchableOpacity 
        style={[styles.backdrop, { backgroundColor: theme.backdropColor }]} 
        activeOpacity={1} 
      />
      <Animated.View 
        style={[
          styles.bottomSheet,
          { 
            backgroundColor: theme.background,
            transform: [{ translateY: animation }] 
          }
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.handleColor }]} />
        
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: theme.accentBackground }]}>
                <Image source={stellarImg} style={{width: wp(20),height: hp(8)}}/>
          </View>
          
          <Text style={[styles.title, { color: theme.text }]}>
          {!visibleBuyUi?"Activate Trade Wallet":"Activate Your Stellar Wallet"}
          </Text>
          
          <Text style={[styles.description, { color: theme.secondaryText }]}>
          {!visibleBuyUi?"Your Stellar wallet isn’t activated yet. Activate it now to automatically trust USDC and start using all features seamlessly!":"Enable Stellar to send, receive, and use assets on the Stellar network.A small network reserve is required to keep your Stellar account active and use on-chain features. This stays in your wallet."}
          </Text>
          
          <View style={styles.userActionBtnCon}>
            {ENVIRONMENT==="TESTNET"?
              <TouchableOpacity
                style={[styles.activateButton, { backgroundColor: Wallet_activation ? "gray" : theme.handleColor }]}
                onPress={() => {
                  ActivationHandle()
                }}
                disabled={Wallet_activation}
              >
                {Wallet_activation ? <ActivityIndicator color={"green"} size={"small"} /> : <Text style={[styles.buttonText,{color:theme.text}]}>Activate Now</Text>}
              </TouchableOpacity>:
            <TouchableOpacity
              style={[styles.activateButton, { backgroundColor: Wallet_activation ? "gray" : "#5B6FED" }]}
              onPress={() => { HandleTokensBuy() }}
              disabled={Wallet_activation}
            >
              {Wallet_activation ? <ActivityIndicator color={"green"} size={"small"} /> : <Text style={styles.buttonText}>{!visibleBuyUi ? "Claim 5 XLM Now!" : "Buy XLM"}</Text>}
            </TouchableOpacity>}
            {portfolioDefault ? (
              <TouchableOpacity
                style={[styles.activateButton, { backgroundColor: Wallet_activation ? "gray" : theme.handleColor }]}
                onPress={() => {
                  handleClose();
                  navigation?.navigate("classic");
                }}
                disabled={Wallet_activation}
              >
                {Wallet_activation ? <ActivityIndicator color={"green"} size={"small"} /> : <Text style={[styles.buttonText,{color:theme.text}]}>Activate Now</Text>}
              </TouchableOpacity>
            ) : (
            <TouchableOpacity
              style={[styles.activateButton, { backgroundColor: Wallet_activation ? "gray" : theme.handleColor }]}
              onPress={() => { setQrVisible(true) }}
              disabled={Wallet_activation}
            >
              {Wallet_activation ? <ActivityIndicator color={"green"} size={"small"} /> : <Text style={[styles.buttonText,{color:theme.text}]}>Receive XLM</Text>}
            </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={handleClose}
            disabled={Wallet_activation}
          >
            <Text style={[styles.cancelText, { color: theme.secondaryText }]}>
              I'll do it myself.
            </Text>
          </TouchableOpacity>
        </View>
        <TokenQrCode
          modalVisible={qrVisible}
          setModalVisible={()=>{setQrVisible(false)}}
          iconType={"XLM"}
          qrvalue={state?.STELLAR_PUBLICK_KEY}
          isDark={isDarkMode}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'flex-end',
    zIndex: 1000,
    paddingBottom:hp(2),
    height:hp(98)
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: 300,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 10,
    alignSelf: 'center',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  activateButton: {
    backgroundColor: '#4F8EF7',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '48%',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  cancelButton: {
    padding: 10,
  },
  cancelText: {
    fontSize: 14,
  },
  userActionBtnCon: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "98%",
    alignItems: "center"
  }
});

export default WalletActivationComponent;