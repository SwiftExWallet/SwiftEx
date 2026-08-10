import { StyleSheet, Text, ActivityIndicator, View, Button, TextInput, FlatList, TouchableOpacity, Alert } from 'react-native';
import DialogInput from 'react-native-dialog-input';

  export const savePassword=(setPassword,password)=>Alert.alert(
    "Password",
    "Please set a password for encrypting your privatekey",
    [
      {
        text: "Cancel",
        onPress: () => console.log("Cancel Pressed"),
        style: "cancel"
      },
      { text: "OK", onPress: () => savePassword(password) }
    ]
  );

  export const getWallets=(user, readData,dispatch,importAllWallets)=>Alert.alert(
    "import Wallets",
    "Do you want to import all your wallets stored in this device?",
    [
      {
        text: "Cancel",
        onPress: () => console.log("Cancel Pressed"),
        style: "cancel"
      },
      { text: "OK", onPress: async () => {
      } }
    ]
  );

export const getPassword = () =>Alert.prompt('Title', 'Subtitle', text =>
console.log('You entered ' + text)
)
  
  