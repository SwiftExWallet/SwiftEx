// import React, { useEffect } from 'react'
// // import PushNotification from 'react-native-push-notification'
// //import PushNotificationIOS from '@react-native-community/push-notification-ios';


// const getToken = async () => {
//   const token = null //await getFcmToken()

//   if (!token) {
//     // Get the device token
//     messaging()
//       .getToken()
//       .then(token => {
//           console.log(token)
//         //setFcmToken(token)
//         //saveFcmToken(token)
//       })
//   }
// }
// export const pushNotificationIos = ()=>{
//   const [permissions, setPermissions] = useState({});

//   useEffect(() => {
//     const type = 'notification';
//     // PushNotificationIOS.addEventListener(type, onRemoteNotification);
//     // return () => {
//       // PushNotificationIOS.removeEventListener(type);
//     // };
//   });

//   const onRemoteNotification = (notification) => {
//     const isClicked = notification.getData().userInteraction === 1;

//     if (isClicked) {
//       // Navigate user to another screen
//     } else {
//       // Do something else with push notification
//     }
//     // Use the appropriate result based on what you needed to do for this notification
//     // const result = PushNotificationIOS.FetchResult.NoData;
//     console.log(result)
//     notification.finish(result);
//   };
// }

// const onRemoteNotificationIOS = (notification) => {
//   const isClicked = notification.getData().userInteraction === 1;

//   if (isClicked) {
//     // Navigate user to another screen
//   } else {
//     // Do something else with push notification
//   }
//   // Use the appropriate result based on what you needed to do for this notification
//   // const result = PushNotificationIOS.FetchResult.NoData;
//   // console.log(result)
//   notification.finish(result);
// };


// export const RemotePushController = () => {
//   useEffect(() => {
//     const type = 'notification';
//     PushNotificationIOS.addEventListener(type, onRemoteNotificationIOS);
//     return () => {
//       PushNotificationIOS.removeEventListener(type);
//     };
//   });

//   useEffect(() => {
//     getToken()
//     PushNotification.configure({
//       // (optional) Called when Token is generated (iOS and Android)
//       onRegister: function(token) {
//         console.log('TOKEN:', token)
//       },

//       // (required) Called when a remote or local notification is opened or received
//       onNotification: function(notification) {
//         console.log('REMOTE NOTIFICATION ==>', notification)

//         // process the notification here
//         //notification.finish(PushNotificationIOS.FetchResult.NoData);

//       },
//       // Android only: GCM or FCM Sender ID
//       senderID: '883312291340',
//       permissions: {
//         alert: true,
//         badge: true,
//         sound: true
//         },
//       popInitialNotification: true,
//       requestPermissions: true
//     })
//   }, [])

//   return null
// }