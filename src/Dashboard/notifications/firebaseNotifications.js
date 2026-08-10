import React, { useEffect } from 'react'
import { Alert, PermissionsAndroid, Platform } from 'react-native'
import messaging from '@react-native-firebase/messaging'
//import { useNavigation } from '@react-navigation/native'
//import { firebaseNotification } from './firebasePushMessages'
//import { useAsyncStorage } from '@react-native-community/async-storage'
//import { FirebaseSendNotification } from './firebasePushMessages'
import {SendNotification} from "./pushController"
import AsyncStorageLib from '@react-native-async-storage/async-storage'
import  Clipboard from "@react-native-clipboard/clipboard";
import { firebaseNotification } from './firebasePushMessages'
import AsyncStorage from '@react-native-async-storage/async-storage'
import store from '../../components/Redux/Store'
import { GetWalletTokens, CHAINS } from '../../utilities/TokenUtils'
import { getAssetId } from '../../utilities/TokenManageHook'
import { MULTICHAIN_PORTFOLIO, PORTFOLIO_CONFIG } from '../../components/Redux/actions/type'


const copyToClipboard = (text) => {
  Clipboard.setString(text);
  alert("Copied");
};

const refreshPortfolioOnNotification = async (source) => {
  try {
    const state = store.getState();
    const evmAddress = state?.wallet?.address;
    const stellarAddress = state?.STELLAR_PUBLICK_KEY;
    const dydxAddress = state?.DYDX_ADDRESS_KEY;

    if (!evmAddress && !stellarAddress) {
      return;
    }

    const walletInfo = await GetWalletTokens(evmAddress, stellarAddress, dydxAddress);
    const apiTokens = walletInfo?.tokens || [];
    if (!Array.isArray(apiTokens) || apiTokens.length === 0) {
      return;
    }

    const storageKey = `${evmAddress}_${stellarAddress}`;
    const stored = await AsyncStorage.getItem(storageKey);
    const savedTokens = stored ? JSON.parse(stored) : [];
    const savedMap = new Map(savedTokens.map((t) => [getAssetId(t), t]));

    const merged = apiTokens.map((apiToken) => {
      const id = getAssetId(apiToken);
      const savedToken = savedMap.get(id);

      if (savedToken) {
        return { ...apiToken, active: savedToken.active };
      }
      if (apiToken && apiToken.balanceUSD !== undefined && apiToken.balanceUSD !== null) {
        const balanceVal = parseFloat(apiToken.balanceUSD);
        if (balanceVal <= 0) return apiToken;
        return { ...apiToken, active: balanceVal >= 0.5 };
      }
      return apiToken;
    });

    const apiIds = new Set(apiTokens.map(getAssetId));
    const knownChainKeys = new Set(Object.keys(CHAINS));
    const customTokens = savedTokens
      .filter((t) => !apiIds.has(getAssetId(t)))
      .map((t) => {
        const isKnownChain = knownChainKeys.has(t.chain);
        if (isKnownChain && t.contractAddress !== 'Native') {
          return { ...t, balance: 0, balanceUSD: 0, active: false };
        }
        return t;
      });

    store.dispatch({
      type: MULTICHAIN_PORTFOLIO,
      payload: { activeWalletPortFolio: [...merged, ...customTokens] },
    });

    store.dispatch({
      type: PORTFOLIO_CONFIG,
      payload: {
        isTotalInUSDVisible: true,
        totalInUSD: walletInfo.totalValueUSD,
        totalStellarInUSD: walletInfo.totalSTRUSD,
      },
    });
    console.info('Portfolio refreshed');
  } catch (e) {
    console.error('Portfolio refresh failed (' + source + '):', e);
  }
};

const PORTFOLIO_REFRESH_TITLE_KEYWORDS = ['received', 'order', 'sdex', 'executed'];

const shouldRefreshPortfolioForTitle = (title) => {
  if (typeof title !== 'string') return false;
  const lowerTitle = title.toLowerCase();
  return PORTFOLIO_REFRESH_TITLE_KEYWORDS.some((keyword) => lowerTitle.includes(keyword));
};



const useFirebaseCloudMessaging = (navigation) => {
  //const navigation = useNavigation()
  //const { getItem: getFcmToken, setItem: saveFcmToken } = useAsyncStorage('fcmToken')

  const [fcmToken, setFcmToken] = React.useState(null)
  const [initialRoute, setInitialRoute] = React.useState('exchange')
  const getToken = async () => {
    const token = null //await getFcmToken()

    if (!token) {
      // Get the device token
      messaging()
        .getToken()
        .then(token => {
          console.log("Firebase Token",token)
          setFcmToken(token)

          if(token){
            AsyncStorageLib.setItem('fcmtoken',JSON.stringify(token))
            // copyToClipboard(token)
            //CustomInfoProvider.show('firebase Token', token, [ {text: `copy`, onPress: () => copyToClipboard(token), style: 'cancel'}, {text: 'close alert', onPress: () => console.log('closed')}, ], { cancelable: true});
          }

          //saveFcmToken(token)
        })
    }
  }

  const FCM_getToken = async () => {
    try {
      const token = await messaging().getToken();
      // Save token to AsyncStorage for future use
      if (token) {
        await AsyncStorageLib.setItem('fcmtoken',JSON.stringify(token))
      }
  
      return token;
    } catch (error) {
      console.error("Error fetching Firebase Token:", error);
      return null; // Return null in case of an error
    }
  };

  const usergetToken = async () => {
    const token = null //await getFcmToken()
    if (!token) {
      messaging()
        .getToken()
        .then(token => {
          if(token){
            copyToClipboard(token)
          }
        })
    }
  }
  
  const requestUserPermission = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
  
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('Notification permission granted ');
      } else {
        console.log('Notification permission denied');
      }
    } else {
      console.log('No need to request notification permission');
    }
  
  }

  useEffect(() => {
    // If using other push notification providers (ie Amazon SNS, etc)
    // you may need to get the APNs token instead for iOS:
    // if(Platform.OS == 'ios') { messaging().getAPNSToken().then(token => { return saveTokenToDatabase(token); }); }

    // Listen to whether the token changes
    return messaging().onTokenRefresh(token => {
     // saveFcmToken(token)
     console.log("Firebase Token",token)
     if(token){
      AsyncStorageLib.setItem('fcmtoken',JSON.stringify(token))
      //Alert.alert('firebase Token', token, [ {text: `copy`, onPress: () => copyToClipboard(token), style: 'cancel'}, {text: 'close alert', onPress: () => console.log('closed')}, ], { cancelable: true});
    }
        
    })
  }, [])

  useEffect(() => {
    const unsubscribe = messaging().onMessage(async (remoteMessage) => {
     //CustomInfoProvider.show('A new FCM message arrived!', JSON.stringify(remoteMessage))
      console.log(remoteMessage.notification.body)
      console.log(remoteMessage.notification.title)
      //SendNotification(remoteMessage.notification.title,remoteMessage.notification.body)
    //  await firebaseNotification(remoteMessage.notification.title,'SwiftEx','You have new Exchange updates',remoteMessage.notification.body)
      if (shouldRefreshPortfolioForTitle(remoteMessage?.notification?.title)) {
        refreshPortfolioOnNotification('onMessage')
      }
    })
    // messaging().setBackgroundMessageHandler(async remoteMessage => {
    //   console.log('Message handled in the background!', remoteMessage);
    //   // firebaseNotification(remoteMessage.notification.title,'SwiftEx','You have new Exchange updates',remoteMessage.notification.body)
    //   //SendNotification(remoteMessage.notification.title,remoteMessage.notification.body)


    // });

    return unsubscribe
  }, [])

  useEffect(() => {
    // Assume a message-notification contains a "type" property in the data payload of the screen to open

    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log(
        'Notification caused app to open from background state:',
        remoteMessage.notification
      )
      if (shouldRefreshPortfolioForTitle(remoteMessage?.notification?.title)) {
        refreshPortfolioOnNotification('onNotificationOpenedApp')
      }
    })

    

    // Check whether an initial notification is available
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage) {
          console.log(
            'Notification caused app to open from quit state:',
            remoteMessage.notification
          )
          setInitialRoute(remoteMessage.data.type) // e.g. "Settings"
          if (shouldRefreshPortfolioForTitle(remoteMessage?.notification?.title)) {
            refreshPortfolioOnNotification('getInitialNotification')
          }
        }
      })
  }, [])

  return {
    fcmToken,
    getToken,
    requestUserPermission,
    FCM_getToken,
    usergetToken
  }
}


export default useFirebaseCloudMessaging

