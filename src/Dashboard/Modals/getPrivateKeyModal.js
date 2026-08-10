import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Animated } from "react-native";
import { useSelector } from "react-redux";
import Modal from "react-native-modal";
import darkBlue from "../../../assets/darkBlue.png";
import { useNavigation } from "@react-navigation/native";
import Icon from "../../icon";
import { Checkbox } from "react-native-paper";
import { colors } from "../../Screens/ThemeColorsConfig";

export const GetPrivateKeyModal = ({ visible, setVisible, onCrossPress }) => {
  const state=useSelector((state)=>state);
  const [Checked, setCheckBox] = useState(false);
  const [Checked2, setCheckBox2] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const sheetRef = useRef(null);
  useEffect(() => {
    setCheckBox(false);
    setCheckBox2(false);
    if (visible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const themeDark = state?.THEME?.THEME !== false;

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <Modal
        isVisible={visible}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        animationInTiming={400}
        animationOutTiming={400}
        backdropTransitionOutTiming={0}
        useNativeDriver={true}
        useNativeDriverForBackdrop={true}
        hideModalContentWhileAnimating
        onBackdropPress={() => setVisible(false)}
        onBackButtonPress={() => setVisible(false)}
        style={styles.modalContainer}
      >
        <View
          style={[
            styles.sheetBody,
            { backgroundColor: themeDark ? colors.dark.bg : colors.light.bg },
          ]}
        >
          <Icon
            type="entypo"
            name="cross"
            color={themeDark ? "#F4F4F8":"#242426" }
            size={29}
            onPress={onCrossPress}
            style={styles.crossIcon}
          />

          <Image
            source={darkBlue}
            style={{ width: wp("16"), height: hp("12") }}
          />

          <Text style={[styles.welcomeText,{color:themeDark ? "#fff" : "black"}]}>Back up your wallet now</Text>
          <Text style={[styles.welcomeText,,{color:themeDark ? "#fff" : "black"}]}>
            In the next page, you will see your secret phrase
          </Text>

          <TouchableOpacity
            style={styles.row}
            onPress={() => setCheckBox(!Checked)}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: Checked?"#fff":"gray" ,
                borderRadius: 10,
              }}
            >
            <Checkbox
              status={Checked ? "checked" : "unchecked"}
              color="#4052D6"
            />
            </View>
            <Text style={[styles.welcomeText2,{color:themeDark ? "#fff" : "black"}]}>
              If I lose my private key, my funds will be lost
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.row}
            onPress={() => setCheckBox2(!Checked2)}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: Checked2?"#fff":"gray" ,
                borderRadius: 10,
              }}
            >
            <Checkbox
              status={Checked2 ? "checked" : "unchecked"}
              color="#4052D6"
            />
            </View>
            <Text style={[styles.welcomeText2,{color:themeDark ? "#fff" : "black"}]}>
              If I share my private key, my funds can get stolen
            </Text>
          </TouchableOpacity>

          {loading && <ActivityIndicator size="large" color="white" />}

          <TouchableOpacity
            disabled={loading || !(Checked && Checked2)}
            style={[
              styles.PressableBtn,
              {
                backgroundColor:
                  Checked && Checked2 ? "#4052D6" : "gray",
              },
            ]}
            onPress={() => {
              setVisible(false);
              navigation.navigate("My PrivateKey");
            }}
          >
            <Text style={{ color: "white" }}>Continue</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </Animated.View>
  );
};

export default GetPrivateKeyModal;

const styles = StyleSheet.create({
  modalContainer: {
    justifyContent: "flex-end",
    margin: 0,
  },
  sheetBody: {
    paddingVertical: hp(3),
    paddingHorizontal: wp(5),
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: "center",
  },
  crossIcon: {
    alignSelf: "flex-end",
    marginBottom: hp(2),
  },
  welcomeText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
    textAlign: "center",
    marginTop: hp(2),
  },
  welcomeText2: {
    fontSize: 16,
    fontWeight: "500",
    color: "white",
    marginLeft: 10,
    width: wp(70),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: hp(3),
  },
  PressableBtn: {
    padding: hp(1.5),
    width: wp(90),
    borderRadius: hp(1),
    alignItems: "center",
    marginTop: hp(3),
  },
});