// import React, {Component} from "react";
// import PushNotification from "react-native-push-notification";
// //import PushNotificationIOS from '@react-native-community/push-notification-ios';
// //import notifee from '@notifee/react-native';

// export default function PushNotifications(){
//         PushNotification.configure({
//             // (optional) Called when Token is generated (iOS and Android)
//             onRegister: function(token) {
//               console.log("TOKEN:", token);
//             },
          
//             // (required) Called when a remote or local notification is opened or received
//             onNotification: function(notification) {
//               console.log("NOTIFICATION:", notification);
          
//               // process the notification here
          
//               // required on iOS only 
//              // notification.finish(PushNotificationIOS.FetchResult.NoData);
//             },
//             // Android only
//             senderID: "1090501687137",
//             // iOS only
//             permissions: {
//               alert: true,
//               badge: true,
//               sound: true
//             },
//             popInitialNotification: true,
//             requestPermissions: true
//           });
    

          
    
// }

// // export const LocalNotification = () => {
// // <<<<<<< HEAD
    
// // =======
// // >>>>>>> 82f128721a5a5b21099fa7fb22b426127b2a24a6
// //     PushNotification.localNotification({
// //       foreground:true,
// //         channelId: "1",
// //       autoCancel: true,
// //       bigText:
// //         'You recieved a new token from talib',
// //       subText: 'Local Notification Demo',
// //       title: 'MunziDapp',
// //       message: 'Expand me to see more',
// //       vibrate: true,
// //       vibration: 300,
// //       playSound: true,
// //       soundName: 'default',
// // <<<<<<< HEAD
// //       actions: '["Yes", "No"]'
// // =======
// //       actions: '["Yes", "No"]',
// //       invokeApp:false
// // >>>>>>> 82f128721a5a5b21099fa7fb22b426127b2a24a6
      
// //     })
// //   }

// // <<<<<<< HEAD
//   // export const SendNotification = async(title,message)=>{
//   //   await notifee.requestPermission()

//   //   // Create a channel (required for Android)
//   //   const channelId = await notifee.createChannel({
//   //     id: 'default',
//   //     name: 'Default Channel',
//   //   });

//   //   // Display a notification
//   //   await notifee.displayNotification({
//   //     title: title,
//   //     body: message,
//   //     android: {
//   //       channelId,
//   //       smallIcon: 'ic_launcher', // optional, defaults to 'ic_launcher'.
//   //       // pressAction is needed if you want the notification to open the app when pressed
//   //       pressAction: {
//   //         id: 'default',
//   //       },
//   //     },
//   //   });
//   // }
