import React, { useState, useEffect, useRef } from "react";
import { AppState, Platform, View } from "react-native";
import GlobalServiceBanner from "../Screens/AppChecks/ServiceStatusBanner";
import "react-native-gesture-handler";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import store from "../components/Redux/Store";
import Dashboard from "../Dashboard/Home";
import MyWallet from "../Dashboard/MyWallet";
import { useDispatch, useSelector } from "react-redux";
import MyHeader from "../Dashboard/MyHeader";
import MyHeader2 from "../Dashboard/MyHeader2";
import { Extend, Collapse } from "../components/Redux/actions/auth";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { CoinDetails } from "../Dashboard/CoinDetail";
import { TxDetail } from "../Dashboard/TxDetail";
import Welcome from "../Dashboard/Welcome";
import Passcode from "../Dashboard/Passcode";
import ConfirmTransaction from "../Dashboard/ConfirmTransaction";
import SendTokens from "../Dashboard/tokens/SendTokens";
import Transactions from "../Dashboard/Transactions";
import AllWallets from "../Dashboard/Wallets/allWallets";
import LockApp from "../Dashboard/lockApp";
import { navigationRef } from "../utilities/utilities";
import BiometricPage from "../Dashboard/BiometricPage";
import Nfts from "../Dashboard/Nfts";
import Settings from "../../Settings";
import Wallet from "../Dashboard/Wallet";
import {
  OfferView,
} from "../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/offers";
import MyPrivateKey from "../Dashboard/myPrivateKey";
import Payout from "../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/payout";
import { NewOfferModal } from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/newOffer.modal";
import classic from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/classic";
import Assets_manage from "../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/stellar/Assets_manage";
import send_recive from "../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/stellar/send_recive";
import SendXLM from "../Dashboard/tokens/sendXLM";
import Asset_info from "../Dashboard/Asset_info";
import EthSwap from "../ethSwap/EthSwap";
import KycComponent from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/KycComponent";
import TokenSend from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/TokenSend";
import StellarTransactionViewer from "../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/StellarTransactionViewer";
import TxDetails from "../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/txDetails";
import FloatingScreen from "../../FloatingComponet/FloatingScreen";
import ExportUSDC from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/ExportUsdc";
import { TransactionView } from "../Dashboard/exchange/crypto-exchange-front-end-main/src/pages/transaction";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../Screens/ThemeColorsConfig";
import BridgeAssets from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/BridgeAssets";
import { AppCheck } from "../Screens/AppChecks/AppCheck";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {TokensManagement} from "../Dashboard/TokensManagement";
import { WalletNetworkSelection } from "../Dashboard/ImportWalletModule/WalletNetworkSelection";
import RampProvider from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/RampProvider";
import BanxaRampProvider from "../Dashboard/exchange/crypto-exchange-front-end-main/src/components/BanxaRampProvider";
import AppStatus from "../Screens/AppChecks/AppStatus";

const Stack = createNativeStackNavigator();

const AuthStack = () => {
  const [webUri, setWebUri] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  const handleStateChange = () => {
    const route = navigationRef?.current?.getCurrentRoute();
    if (route?.name) setCurrentRoute(route.name);
  };
  return(
    <GestureHandlerRootView style={{flex:1}}>
    <NavigationContainer
    theme={{ colors: { background: "black" } }}
    ref={navigationRef}
    onStateChange={handleStateChange}
  >
    <Stack.Navigator
      mode="modal"
      screenOptions={{
        animation: "slide_from_right",
      }}
    >
     <Stack.Screen
        name="Passcode"
        component={Passcode}
        options={{
          headerShown: false,gestureEnabled:false,
          headerStyle: { backgroundColor: "#000C66" },
          headerTintColor: "white",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      />
      <Stack.Screen
        name="HomeScreen"
        component={Dashboard}
        options={{
          headerShown: false,gestureEnabled:false,
        }}
      />
      <Stack.Screen
        name="MyWallet"
        component={MyWallet}
        options={{headerShown:false}}
      />

      <Stack.Screen
        name="Wallet"
        component={Wallet}
        options={{headerShown:false}}
      />

      <Stack.Screen
        name="CoinDetails"
        component={CoinDetails}
        options={{
          gestureEnabled:true,
          headerShown:false
        }}
      />

      <Stack.Screen
        name="Settings"
        component={Settings}
        options={{
          headerShown: false,gestureEnabled:false,
        }}
      />
       <Stack.Screen
        name="classic"
        component={classic}
        options={{
          headerShown: false,
        }}
      />

          <Stack.Screen
            name="ExportUSDC"
            component={ExportUSDC}
            options={{
              headerShown: false,
            }}
          />

      <Stack.Screen
        name="Nfts"
        component={Nfts}
        options={{
          headerShown: false,gestureEnabled:false,
        }}
      />

      <Stack.Screen
        name="TxDetail"
        component={TxDetail}
        options={{
          headerShown:false
        }}
      />
      <Stack.Screen
        name="Welcome"
        component={Welcome}
        options={{
          headerShown: false,gestureEnabled:false,
          headerStyle: { backgroundColor: "#000C66" },
          headerTintColor: "white",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      />
      
      <Stack.Screen
        name="My PrivateKey"
        component={MyPrivateKey}
        options={{
          headerShown:false
        }}
      />

      <Stack.Screen
        name="Send"
        component={SendTokens}
        options={{
          headerShown: false,
        }}
      />

<Stack.Screen
        name="SendXLM"
        component={SendXLM}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Asset_info"
        component={Asset_info}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="Confirm Tx"
        component={ConfirmTransaction}
        options={{
           headerShown:false
        }}
      />

      <Stack.Screen
        name="Transactions"
        component={Transactions}
        options={{
          headerShown:false
        }}
      />
      <Stack.Screen
        name="AllWallets"
        component={AllWallets}
        options={{
          gestureEnabled:true,
          headerShown:false
        }}
      />
      <Stack.Screen
        name="Biometric"
        component={BiometricPage}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="appLock"
        component={LockApp}
        options={{
          headerShown: false,gestureEnabled:false,
          headerStyle: { backgroundColor: "#000C66" },
          headerTintColor: "white",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      />

<Stack.Screen
        name="payout"
        component={Payout}
        options={{
          headerShown: false,
          headerStyle: { backgroundColor: "#4CA6EA" },
          headerTintColor: "white",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      />
      <Stack.Screen
        name="RampProvider"
        component={RampProvider}
        options={{
          headerShown: false,
          headerStyle: { backgroundColor: "#4CA6EA" },
          headerTintColor: "white",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      />

<Stack.Screen
        name="newOffer_modal"
        component={NewOfferModal}
        options={{
          headerShown: false,
          gestureEnabled:false,
          headerStyle: { backgroundColor: "#4CA6EA" },
          headerTintColor: "white",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      />   

      <Stack.Screen
        name="Assets_manage"
        component={Assets_manage}
        options={{
          headerShown: false,
          headerStyle: { backgroundColor: "#4CA6EA" },
          headerTintColor: "white",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      />
      <Stack.Screen
        name="StellarTransactionViewer"
        component={StellarTransactionViewer}
        options={{
          headerShown: false,
          headerStyle: { backgroundColor: "#4CA6EA" },
          headerTintColor: "white",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      />        
      <Stack.Screen
        name="send_recive"
        component={send_recive}
        options={{
          headerShown: false,
          headerStyle: { backgroundColor: "#4CA6EA" },
          headerTintColor: "white",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      /> 
       <Stack.Screen
        name="EthSwap"
        component={EthSwap}
        options={{headerShown:false}}
      />
       <Stack.Screen
        name="KycComponent"
        component={KycComponent}
        options={{headerShown:false}}
      />
       <Stack.Screen
        name="TokenSend"
        component={TokenSend}
        options={{headerShown:false}}
      />
      <Stack.Screen
        name="StellarTransactions"
        component={TransactionView}
        options={{
          headerShown:false
        }}
      />
      <Stack.Screen
        name="BridgeAssets"
        component={BridgeAssets}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="BanxaRampProvider"
        component={BanxaRampProvider}
        options={{
          headerShown: false,
        }}
      />
        <Stack.Screen
        name="StellarOffers"
        component={OfferView}
        options={{
          headerShown:false
        }}
      />
       <Stack.Screen
        name="AppCheck"
        component={AppCheck}
        options={{
          headerShown:false
        }}
      />
      <Stack.Screen
        name="TokensManagement"
        component={TokensManagement}
        options={{
          headerShown:false
        }}
      />
      <Stack.Screen
        name="WalletNetworkSelection"
        component={WalletNetworkSelection}
        options={{
          headerShown:false
        }}
      />

      <Stack.Screen
        name="AppStatus"
        component={AppStatus}
        options={{
          headerShown:false
        }}
      />

      <Stack.Screen
        name="TxDetails"
        options={{headerShown:false}}
        >
        {(props) => <TxDetails {...props} showWebView={(uri) => setWebUri(uri)} />}
        </Stack.Screen>
    </Stack.Navigator>
  </NavigationContainer>
  <GlobalServiceBanner currentRoute={currentRoute} />
      <FloatingScreen
        uri={webUri}
        visible={!!webUri}
        onClose={() => setWebUri(null)}
      />
  </GestureHandlerRootView>
  )
};
const NavigationProvider = () => {
  let statee = useSelector((state) => state);
  const [extended, setExtended] = useState(false);
  const [state, setState] = useState(statee);

  const updateState = () => {
    let data = store.getState();
    return setState(data);
  };

  function changeState() {
    const data = dispatch(Extend())
      .then((response) => {
        console.log(response);
        const res = response;
        if (res.status == "success") {
          console.log(res);
          console.log("success");
          updateState();
        }
      })
      .catch((error) => {
        console.log(error);
      });
    console.log(data);
  }

  function collapseState() {
    const data = dispatch(Collapse())
      .then((response) => {
        console.log(response);
        const res = response;
        if (res.status == "success") {
          console.log(res);
          console.log("success");
          updateState();
        }
      })
      .catch((error) => {
        console.log(error);
      });
  }

  const Header1 = (title, state) => {
    return (
      <MyHeader
        title={title}
        state={state}
        changeState={changeState}
        extended={extended}
        setExtended={setExtended}
      />
    );
  };
  const Header2 = (title, state) => {
    return (
      <MyHeader2
        title={title}
        state={state}
        changeState={collapseState}
        extended={extended}
        setExtended={setExtended}
      />
    );
  };

  const dispatch = useDispatch();

  function getHeaderTitle(route) {
    const routeName = getFocusedRouteNameFromRoute(route);
    console.log(routeName);
    switch (routeName) {
      case "Home":
        return "Home";
      case "Market":
        return "Market";
      case "Account":
        return "Account";
      case "Wallet":
        return "Wallet";
      case "Assets":
        return "Assets";
      default:
        return "Home";
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: statee && statee.THEME && statee.THEME.THEME === false ? colors.light.bg : colors.dark.bg,marginTop:Platform.OS==="ios"&&-50 }}>
    <AuthStack
      getHeaderTitle={getHeaderTitle}
      extended={extended}
      state={state}
      Header1={Header1}
      Header2={Header2}
      dispatch={dispatch}
    />
    </SafeAreaView>
  );
};
export default NavigationProvider;
