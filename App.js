import "./global";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Provider as StoreProvider } from "react-redux";
import store from "./src/components/Redux/Store";
import NavigationProvider from "./src/Routes/Navigation";
import { Provider as PaperProvider } from "react-native-paper";
import { LogBox } from "react-native";
import { NativeBaseProvider } from "native-base";
import Network_Checker from "./src/utilities/Network_Checker";
import CustomInfoProvider from "./src/Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";
import ErrorBoundary from "./src/utilities/ErrorBoundary";
import crashlytics from '@react-native-firebase/crashlytics';
import { CheckAppAvailable } from "./src/Screens/AppChecks/AppCheckService";
import { withStallion } from 'react-native-stallion';
import AppOTAUpdates from "./src/Dashboard/exchange/crypto-exchange-front-end-main/src/pages/AnimatedComponent/AppOTAUpdates";

function App() {
  LogBox.ignoreAllLogs()
  if (__DEV__) {
    crashlytics().setCrashlyticsCollectionEnabled(false);
  }
  useEffect(() => {
    crashlytics().log('App mounted.');
  }, []);

  
  useEffect(() => {
    CheckAppAvailable()
  }, []);
 
  return (
     <ErrorBoundary>
      <AppOTAUpdates />
    <StoreProvider store={store}>
      <NativeBaseProvider>
        <PaperProvider>
          <Network_Checker/>
            <View style={styles.container}>

              <NavigationProvider />
            </View>
        </PaperProvider>
      </NativeBaseProvider>
      <CustomInfoProvider/>
    </StoreProvider>
    </ErrorBoundary>
  );
}
const styles = StyleSheet.create({
  container: {
    display: "flex",
    flex: 1,
    backgroundColor: "#131E3A",
    color: "white",
  },
  content: {
    padding: 40,
  },
});
export default withStallion(App)
