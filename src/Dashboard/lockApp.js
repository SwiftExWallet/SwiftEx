import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Button,
  Image,
  TouchableOpacity,
  BackHandler,
  Alert,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import darkBlue from '../../assets/darkBlue.png'
import ReactNativePinView from "react-native-pin-view";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDispatch } from "react-redux";
import { Platform } from "react-native";
import { setPlatform } from "../components/Redux/actions/auth";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useBiometricsForAppLock } from "../biometrics/biometric";
import { alert } from "./reusables/Toasts";
import CustomInfoProvider from "./exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";
import { CheckPasscode } from "../biometrics/utils";
const LockApp = (props) => {
  const [pin, setPin] = useState();
  const [status, setStatus] = useState("pinset");
  const [showRemoveButton, setShowRemoveButton] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");
  const [showCompletedButton, setShowCompletedButton] = useState(false);
  const navigation = useNavigation();
  const pinView = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dispatch = useDispatch();

  const Spin = new Animated.Value(0);
  const SpinValue = Spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const exitApp = () => {
    BackHandler.exitApp();
  };

  
  useFocusEffect(
    React.useCallback(() => {
      const backAction = () => {
        CustomInfoProvider.show("Hold on!", "Are you sure you want to exit?", [
          { text: "Cancel", style: "cancel" },
          { text: "Yes", onPress: () => BackHandler.exitApp() },
        ])
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );

      return () => backHandler.remove();
    }, [])
  );

  useFocusEffect(
    React.useCallback(()=>{
      const checkBioMetric = async()=>{

        const biometric = await AsyncStorage.getItem('Biometric')
        if(biometric==='SET'){
          useBiometricsForAppLock(navigation)
          
        }
      }
      checkBioMetric()
    },[])
  )

  useEffect(async () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
    }).start();

    Animated.timing(Spin, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: true,
    }).start();

    if (enteredPin.length > 0) {
      setShowRemoveButton(true);
    } else {
      setShowRemoveButton(false);
    }
    if (enteredPin.length === 6) {
      //setShowCompletedButton(true)
      const validPin=await CheckPasscode(enteredPin)

      if (validPin) {
        navigation.goBack();
      } else {
        
        alert("error","Incorrect pin try again.");
        pinView.current.clearAll();

      }
    } else {
      setShowCompletedButton(false);
    }
  }, [fadeAnim, enteredPin]);

  return (
    
    <Animated.View // Special animatable View
      style={{ opacity: fadeAnim, }}
    >
      <View style={style.Body}>
        <Animated.Image
          style={{
            width: wp("12"),
            height: hp("12"),
            padding: 30,
            marginTop: hp(2),
            //transform: [{ rotate: SpinValue }],
          }}
          source={darkBlue}
        />
        <Text style={style.welcomeText}> Hi,</Text>
        <Text style={style.welcomeText1}>
          {" "}
          {status == "verify"
            ? "Please Re-enter your pin"
            : status === "pinset"
            ? "Please enter your pin"
            : "Please create a pin"}
        </Text>
        <View style={{ marginTop: hp(5) }}>
          <ReactNativePinView
            inputSize={25}
            ref={pinView}
            pinLength={6}
            buttonSize={50}
            onValueChange={(value) => setEnteredPin(value)}
            buttonAreaStyle={{
              marginTop: 30,
            }}
            inputAreaStyle={{
              // marginBottom: 24,
            }}
            inputViewEmptyStyle={{
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: "#FFF",
            }}
            inputViewFilledStyle={{
              backgroundColor: "#FFF",
            }}
            buttonViewStyle={{
              borderWidth: 1,
              borderColor: "#FFF",
              marginVertical:hp(1)
            }}
            buttonTextStyle={{
              color: "#FFF",
            }}
            onButtonPress={async (key) => {
              console.log(key);
              if (key === "custom_left") {
                pinView.current.clear();
              }
              if (key === "custom_right") {
                console.log("pressed");
                 const validPin=await CheckPasscode(enteredPin)

                if (validPin) {
                  navigation.goBack();
                } else {
                  alert("error","Incorrect pin try again.");
                }
              }
            }}
            customLeftButton={
              showRemoveButton ? (
                <Icon name={"ios-backspace"} size={36} color={"gray"} />
              ) : undefined
            }
            customRightButton={
              showCompletedButton ? (
                <Icon
                  name={"ios-chevron-forward-circle"}
                  size={36}
                  color={"#FFF"}
                />
              ) : <Icon
              name={"ios-chevron-forward-circle"}
              size={36}
              color={"#FFF"}
            />
            }
          />
        </View>
      </View>
    </Animated.View>
  );
};

export default LockApp;

const style = StyleSheet.create({
  Body: {
    display: "flex",
    backgroundColor: "#131E3A",
    height: hp(100),
    width: wp(100),
    alignItems: "center",
    textAlign: "center",
    // justifyContent:"center"
  },
  welcomeText: {
    fontSize: 16,
    fontWeight: "200",
    color: "white",
    marginTop: hp(3),
  },
  welcomeText2: {
    fontSize: 20,
    fontWeight: "200",
    color: "white",
    marginTop: hp(10),
  },
  Button: {
    marginTop: hp(20),
  },
  tinyLogo: {
    width: wp("5"),
    height: hp("5"),
    padding: 30,
    marginTop: hp(10),
  },
  Text: {
    marginTop: hp(5),
    fontSize: 15,
    fontWeight: "200",
    color: "white",
  },
  welcomeText1:{
    fontSize: 16,
    fontWeight: "200",
    color: "white",
    marginTop: hp(1),
  }
});
