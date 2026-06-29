import notifee, { AndroidImportance } from '@notifee/react-native';

export const firebaseNotification = async (remoteMessage) => {
  const title = remoteMessage.notification?.title || remoteMessage.data?.title;
  const body = remoteMessage.notification?.body || remoteMessage.data?.body;

  if (!title && !body) {
    console.log('Notifee: Suppressed a blank notification.');
    return; 
  }

  const channelId = await notifee.createChannel({
    id: 'default',
    name: 'Default Channel',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });

  await notifee.displayNotification({
    id: remoteMessage.messageId ?? String(Date.now()),
    title: title,
    body: body,
    data: remoteMessage.data,
    android: {
      channelId,
      importance: AndroidImportance.HIGH,
      pressAction: { id: 'default' },
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
};