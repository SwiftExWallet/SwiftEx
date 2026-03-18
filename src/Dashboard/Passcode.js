import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Animated, Alert, Image, Platform, } from "react-native";
import darkBlue from "../../assets/darkBlue.png";
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from "react-native-responsive-screen";
import { useDispatch } from "react-redux";
import { useFocusEffect, useIsFocused, useNavigation } from "@react-navigation/native";
import { useBiometrics } from "../biometrics/biometric";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SET_APP_THEME } from "../components/Redux/actions/type";
import { alert } from "./reusables/Toasts";
import Icon from "../icon";
import { setPlatform } from "../components/Redux/actions/auth";
import { colors } from "../Screens/ThemeColorsConfig";
import { AppNavigation } from "../Screens/AppChecks/AppCheckService";
import { AddPassCode, CheckPasscode } from "../biometrics/utils";

const Passcode = (props) => {
  const [pin, setPin] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [activeTheme,setactiveTheme] = useState(false);
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const dispatch = useDispatch();
  const [status, setStatus] = useState("");
  const [tempPin, setTempPin] = useState("");
  const isFocused=useIsFocused();
  const handlePress = async (value) => {
  if (pin.length < 6) {
    const newPin = pin + value; 
    setPin(newPin);

    if (newPin.length === 6) {
      if (status === "verify") {
        if (tempPin === newPin) {
          await AddPassCode(tempPin)
          resetInput();
          setStatus("");
          AppNavigation(props)
        } else {
          triggerShake();
          setIsError(true);
          setTimeout(() => {
            alert("error", "PIN did not match. Please try again.");
            resetInput();
            setStatus("");
          }, 200);
        }
      } else if (status === "pinset") {
        const validPin=await CheckPasscode(newPin);
        const user = await AsyncStorage.getItem("user");

        if (validPin) {
          setIsSuccess(true);
          setTimeout(() => {
            resetInput();
            AppNavigation(props,user)
          }, 500);
        } else {
          triggerShake();
          setIsError(true);
          setTimeout(() => {
            resetInput();
          }, 1000);
        }
      } else {
        setTempPin(newPin);
        setStatus("verify");
        resetInput();
      }
    }
  }
};

  

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const resetInput = () => {
    setPin("");
    setIsError(false);
    setIsSuccess(false);
  };

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };
  useFocusEffect(
    React.useCallback(() => {
      const checkBioMetric = async () => {
        const biometric = await AsyncStorage.getItem("Biometric");
        if (biometric === "SET") {
          useBiometrics(props.navigation);
        }
      };
      checkBioMetric();
    }, [])
  );
  useEffect(() => {
    const initializeApp = async () => {
      const Checked = await AsyncStorage.getItem("APP_THEME");
      setactiveTheme(Checked === null ? false : Checked === "false" ? false : true);
      dispatch({
        type: SET_APP_THEME,
        payload: { THEME: Checked === null ? false : Checked === "false" ? false : true },
      });
    };
    initializeApp();
  }, [isFocused]);

  useEffect(() => {
    const initializeApp = async () => {
      const Check = await AsyncStorage.getItem("pin");
      const biometric = await AsyncStorage.getItem("Biometric");
      if (biometric === "SET") {
        useBiometrics(props.navigation);
      }
      if (Check) {
        setStatus("pinset");
      }
      if (Platform.OS === "ios") {
        dispatch(setPlatform("ios"));
      }
    };
    initializeApp();
  }, []);

  const handleBiometrics = async () => {
    const biometric = await AsyncStorage.getItem("Biometric");
    if (biometric === "SET") {
      useBiometrics(props.navigation);
    } else {
      alert('error', Platform.OS === "android"
        ? 'Enable biometrics in SwiftEx app settings.'
        : 'Enable face Id in SwiftEx app settings.'
      );
    }
  };
  const theme = activeTheme ? colors.dark : colors.light;
  return (
    <View style={[styles.container,{backgroundColor:theme.bg}]}>
      <View style={styles.upper_con}>
        <Image
          style={{
            width: Platform.OS==="ios"?wp(34):wp(20),
            height: Platform.OS==="ios"?hp(20):hp(15),
            padding: 30,
            marginTop: hp(2),
          }}
          source={darkBlue}
        />
        <View style={styles.text_con}>
          <Text style={[styles.text_style,{color:theme.headingTx}]}>Hi,</Text>
          <Text style={[styles.text_style, { marginTop: 10, color:theme.headingTx}]}>{status === "verify"
            ? "Please Re-enter your pin"
            : status === "pinset"
            ? "Please enter your pin"
            : "Please create a pin"}</Text>
        </View>
        <Animated.View
          style={[
            styles.pinContainer,
            { transform: [{ translateX: shakeAnimation }] },
          ]}
        >
          {[0, 1, 2, 3, 4, 5].map((_, index) => (
            <View
              key={index}
              style={[
                styles.pinBox,
                isError && styles.pinBoxError,
                isSuccess && styles.pinBoxSuccess,
              ]}
            >
              {pin.length > index && (
                <View
                  style={[
                    styles.dot,
                    isError && styles.dotError,
                    isSuccess && styles.dotSuccess,
                  ]}
                />
              )}
            </View>
          ))}
        </Animated.View>
      </View>
      <View style={styles.keypad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((key) => (
          <TouchableOpacity
            key={key}
            onPress={() => handlePress(key.toString())}
            style={styles.key}
          >
            <Text style={[styles.keyText,{color:theme.headingTx}]}>{key}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity disabled={!status} onPress={()=>{resetInput(),handleBiometrics()}} style={styles.key}>
         {status&& <Icon
                type={"materialCommunity"}
                name={Platform.OS === "android" ? "fingerprint" : "face-recognition"}
                size={36}
                color={theme.inactiveTx}
              />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handlePress("0")} style={styles.key}>
          <Text style={[styles.keyText,{color:theme.headingTx}]}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={styles.key}>
          <Icon
                type={"materialCommunity"}
                name={"backspace"}
                size={36}
                color={theme.inactiveTx}
              />
        </TouchableOpacity>
      </View>
      <View style={styles.text_con}>
        <Text style={[styles.text_style, { fontSize: 13, color: theme.inactiveTx }]}>Passcode adds an extra layer of security</Text>
        <Text style={[styles.text_style, { fontSize: 13, color: theme.inactiveTx }]}>when using the app</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  upper_con:{ 
    height: "50%",
    alignItems: "center",
    width: "100%",
    paddingTop: 40
  },
  text_con: {
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10
  },
  text_style: {
    fontSize: 19,
    color: "#fff"
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#011434"
  },
  pinContainer: {
    flexDirection: "row",
    marginBottom: 20,
    marginTop:20
  },
  pinBox: {
    width: 48,
    height: 50,
    margin: 5,
    borderWidth: 1,
    borderColor: "gray",
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  pinBoxError: {
    borderColor: "red",
  },
  pinBoxSuccess: {
    borderColor: "green",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "silver",
  },
  dotError: {
    backgroundColor: "red",
  },
  dotSuccess: {
    backgroundColor: "green",
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: wp(100),
    justifyContent: "center"
  },
  key: {
    width: 60,
    height: 60,
    marginHorizontal: 33,
    marginVertical: 5,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 30,
  },
  keyText: {
    fontSize: 23,
    fontWeight: "bold",
    color: "white",
  },
});

export default Passcode;