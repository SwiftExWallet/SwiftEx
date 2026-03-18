/**
 * @format
 */
import './shim';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;
global.process = require('process');

import { AppRegistry, Platform } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';
import { firebaseNotification } from './src/Dashboard/notifications/firebasePushMessages';
import notifee, { EventType } from '@notifee/react-native';
async function requestPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  if (enabled) {
    console.log("FCM Permission granted:", authStatus);
  } else {
    console.log("FCM Permission denied");
  }
}


messaging().onMessage(async (remoteMessage) => {
  firebaseNotification(remoteMessage);
});

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  firebaseNotification(remoteMessage);
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    console.log('Notification:', detail.notification?.data);
  }
});
requestPermission();
AppRegistry.registerComponent(Platform.OS==="ios"?"test_app":appName, () => App);
