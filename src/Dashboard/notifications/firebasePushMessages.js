import notifee, { AndroidImportance, AndroidStyle } from '@notifee/react-native';
export const firebaseNotification = async(remoteMessage) => {
    const channelId = await notifee.createChannel({
    id: 'default',
    name: 'Default Channel',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });

  await notifee.displayNotification({
    id: remoteMessage.messageId?? String(Date.now()),
    title: remoteMessage.notification?.title,
    body: remoteMessage.notification?.body,
    data: remoteMessage.data,

    android: {
      channelId,
      importance: AndroidImportance.HIGH,
      pressAction: { id: 'default' },
      style: {
        type: AndroidStyle.BIGTEXT,
        text: remoteMessage.notification?.body,
      },
    },

    ios: {
      sound: 'default',
      badge: 0,
      foregroundPresentationOptions: {
        alert: true,
        badge: true,
        sound: true,
      },
    },
  });
  }