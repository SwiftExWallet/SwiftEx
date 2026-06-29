import React, { useRef, useEffect, useState } from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from "react-native-responsive-screen";
import darkBlue from "../../../assets/darkBlue.png";
import ReactNativePinView from "react-native-pin-view";
import Icon from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Modal from "react-native-modal";
import { useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { colors } from "../../Screens/ThemeColorsConfig";
import Snackbar from "react-native-snackbar";
import { useBiometrics_run } from "../../biometrics/biometric";
import { CheckPasscode } from "../../biometrics/utils";

const AuthRequest = ({ visible, heading, subHeading, proccedNextStep }) => {
    const state = useSelector((state) => state);
    const theme = state.THEME.THEME ? colors.dark : colors.light;
    const navigation = useNavigation();
    const [enteredPin, setEnteredPin] = useState("");
    const pinView = useRef(null);

    const useBiometricOrFaceID = async () => {
        const biometric = await AsyncStorage.getItem("Biometric");
        if (biometric === "SET") {
            const getAccess = await useBiometrics_run();
            if (getAccess) {
                proccedNextStep()
            } else {
                Snackbar.show({
                    text: "Authentication Faild.",
                    duration: Snackbar.LENGTH_SHORT,
                    backgroundColor: 'red',
                });
            }
        }
    }
    useEffect(() => {
        if (visible) {
            useBiometricOrFaceID()
        }
    }, [visible])

    useEffect(() => {
        const verifyPasscode = async () => {
            try {
                if (enteredPin.length === 6) {
                    const validPin=await CheckPasscode(enteredPin);
                    if (validPin) {
                        pinView.current.clearAll();
                        proccedNextStep()
                    }
                    else {
                        pinView.current.clearAll();
                        Snackbar.show({
                            text: "Wrong Password.",
                            duration: Snackbar.LENGTH_SHORT,
                            backgroundColor: 'red',
                        });
                    }
                }
            } catch (error) {
                console.log("verify-passcode-error", error)
            }
        }
        verifyPasscode()
    }, [enteredPin])
    return (
        <Modal
            animationType="slide"
            visible={visible}
            onRequestClose={() => { navigation.goBack() }}
            useNativeDriver={true}
            useNativeDriverForBackdrop={true}
            hideModalContentWhileAnimating
            onBackdropPress={() => { navigation.goBack() }}
            onBackButtonPress={() => { navigation.goBack() }}
            style={style.container}
        >
            <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30 }}>
                <View style={style.modalContainer}>
                    <Image style={{ width: wp(19), height: hp(13) }} source={darkBlue} />
                    <View style={style.headerTxtCon}>
                        <Text style={[style.headinTxt, { color: theme.headingTx }]}>{heading}</Text>
                        <Text style={[style.subHeadinTxt, { color: theme.headingTx }]}>{subHeading}</Text>
                    </View>
                </View>
                <ReactNativePinView
                    inputSize={23}
                    ref={pinView}
                    pinLength={6}
                    buttonSize={50}
                    onValueChange={(value) => setEnteredPin(value)}
                    inputViewEmptyStyle={{ backgroundColor: "transparent", borderWidth: 1, borderColor: theme.inactiveTx }}
                    inputViewFilledStyle={{ backgroundColor: theme.inactiveTx }}
                    buttonTextStyle={{ color: theme.headingTx }}
                    customLeftButton={
                        <Icon name={Platform.OS === "android" ? "finger-print" : "happy"} size={34} color={theme.headingTx} />
                    }
                    customRightButton={
                        <Icon name={"backspace"} size={34} color={theme.headingTx} />
                    }
                    onButtonPress={async (key) => {
                        if (key === "custom_left") {
                            await useBiometricOrFaceID();
                        }
                        if (key === "custom_right") {
                            pinView.current.clear();
                        }
                    }}
                    buttonTextByKey={{
                        one: '1',
                        two: '2',
                        three: '3',
                        four: '4',
                        five: '5',
                        six: '6',
                        seven: '7',
                        eight: '8',
                        nine: '9',
                        zero: '0',
                    }}
                />
            </View>
        </Modal>
    );
};

export default AuthRequest;

const style = StyleSheet.create({
    container: {
        justifyContent: "flex-end",
        margin: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)"
    },
    modalContainer: {
        paddingTop: 13,
        flexDirection: "row",
        marginHorizontal: wp(6),
        alignItems: "center"
    },
    headerTxtCon: {
        flexDirection: "column",
        marginLeft: wp(2),
        width: wp(68)
    },
    headinTxt: {
        marginTop: hp(-1),
        fontSize: 19,
        fontWeight: "600"
    },
    subHeadinTxt: {
        fontSize: 16,
        fontWeight: "400",
    }
});
