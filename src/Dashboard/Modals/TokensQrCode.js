import React, { useEffect, useRef } from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Animated, TouchableWithoutFeedback,
  Platform,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Clipboard from "@react-native-clipboard/clipboard";
import LinearGradient from "react-native-linear-gradient";
import ViewShot from "react-native-view-shot";
import Share from "react-native-share";
import darkBlue from "../../../assets/darkBlue.png";
import { Image } from "react-native";
import { WALLET_CONNECT_INFO } from "../../Dashboard/constants"
import { alert } from "../reusables/Toasts";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const TokenQrCode = ({ modalVisible, setModalVisible, iconType, qrvalue, isDark }) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const viewShotRef = useRef(null);

  useEffect(() => {
    if (modalVisible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [modalVisible]);

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setModalVisible(false));
  };

  const copyToClipboard = () => {
    Clipboard.setString(qrvalue);
    alert('success', 'Address copied successfully!');
    closeModal();
  };

  const shortAddress = qrvalue
    ? `${qrvalue.slice(0, 10)}...${qrvalue.slice(-10)}`
    : "";

  const shareAsImage = async () => {
    try {
      const uri = await viewShotRef.current.capture();
      await Share.open({ url: uri, type: "image/png", failOnCancel: false });
    } catch (error) {
      console.error('Error sharing QR code', error);
    }
  };

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeModal}
    >
      <TouchableWithoutFeedback onPress={closeModal}>
        <Animated.View style={[s.overlay, { opacity: opacityAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                s.bottomSheet,
                { backgroundColor: isDark ? "#0B0B0F" : "#F4F4F8", transform: [{ translateY: slideAnim }] },
              ]}
            >
              <View style={s.handleBar}>
                <View style={[s.handle, { backgroundColor: isDark ? "#3A3A4C" : "#E0E0E0" }]} />
              </View>

              <View style={s.header}>
                <View>
                  <Text style={[s.title, { color: isDark ? "#FFFFFF" : "#212529" }]}>
                    Receive {iconType}
                  </Text>
                  <Text style={[s.subtitle, { color: isDark ? "#8B93A7" : "#6C757D" }]}>
                    Scan or share QR code
                  </Text>
                </View>
                <TouchableOpacity onPress={closeModal} style={[s.closeButton, { backgroundColor: isDark ? "#000" : "#FFF" }]}>
                  <Icon name="close" size={24} color={isDark ? "#FFF" : "#000"} />
                </TouchableOpacity>
              </View>

              <View style={s.qrSection}>
                <View style={[s.qrWrapper, { backgroundColor: "#FFFFFF" }]}>
                  <QRCode value={qrvalue || " "} size={wp(45)} logoBorderRadius={10} />
                </View>
                <Text style={[s.middleHeading, { color: isDark ? "#fff" : "#272729" }]}>
                  Your {iconType} Address
                </Text>
                <Text style={[s.middleSubHeading, { color: isDark ? "gray" : "#3F3F41" }]}>
                  Use this address to receive tokens on {iconType}
                </Text>

                <View style={[s.addressContainer, { backgroundColor: isDark ? "#242426" : "#FFFFFF" }]}>
                  <Text style={[s.addressText, { color: isDark ? "#FFFFFF" : "#212529" }]} numberOfLines={1} ellipsizeMode="middle">
                    {shortAddress}
                  </Text>
                  <TouchableOpacity onPress={copyToClipboard}>
                    <Icon name="content-copy" size={24} color={isDark ? "#FFFFFF" : "#212529"} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.actionsContainer}>
                <TouchableOpacity style={s.actionButton} onPress={shareAsImage} activeOpacity={0.7}>
                  <View style={s.outlineButton}>
                    <Icon name="share-variant" size={18} color="#E3DFDF" />
                    <Text style={s.actionLabel}>Share</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>

      <ViewShot
        ref={viewShotRef}
        options={{ format: "png", quality: 1 }}
        style={s.offscreen}
      >
      
        <LinearGradient
          colors={["#0d0b1f", "#171335", "#0d0b1f"]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={Platform.OS==="android"?s.card:s.cardISO}
        >
          <View style={Platform.OS==="android"?s.cardHeader:s.cardHeaderIOS}>
            <View style={s.brandRow}>
              <Image source={darkBlue} style={s.logo} />
              <View style={{ marginLeft: -5 }}>
                <Text style={s.brandName}>{WALLET_CONNECT_INFO.name} Wallet</Text>
                <Text style={s.brandSub}>RECEIVE ADDRESS</Text>
              </View>
            </View>
            <View style={s.pill}>
              <Text style={s.pillText}>{iconType}</Text>
            </View>
          </View>

          <View style={s.cardQrWrap}>
            <View style={s.cardQrBorder}>
              <View style={s.cardQrInner}>
                <QRCode value={qrvalue || " "} size={180} backgroundColor="#fff" color="#000" />
              </View>
            </View>
          </View>

          <Text style={s.cardLabel}>WALLET ADDRESS</Text>
          <View style={Platform.OS==="android"?s.cardAddressBox:s.cardAddressBoxIOS}>
            <Text style={s.cardAddress}>{qrvalue}</Text>
          </View>

          <View style={s.cardFooter}>
            <Text style={s.footerLink}>{WALLET_CONNECT_INFO.url}</Text>
            <Text style={s.footerNote}>Scan to send {iconType}</Text>
          </View>
        </LinearGradient>
      </ViewShot>
    </Modal>
  );
};

export default TokenQrCode;

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: hp(4),
    maxHeight: SCREEN_HEIGHT * 0.85,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20,
  },
  handleBar: { alignItems: "center", paddingVertical: hp(1.5) },
  handle: { width: wp(12), height: 4, borderRadius: 2 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: wp(5),
    paddingBottom: hp(2),
  },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  closeButton: { padding: wp(1), borderRadius: 50 },
  qrSection: { paddingHorizontal: wp(5), alignItems: "center" },
  qrWrapper: { padding: wp(4), borderRadius: 16 },
  middleHeading: { marginTop: 29, fontSize: 20 },
  middleSubHeading: { fontSize: 14, marginBottom: 20 },
  addressContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: wp(90),
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.5),
    borderRadius: 12,
    gap: wp(2),
    marginTop: 10,
  },
  addressText: { flex: 1, fontSize: 16, fontWeight: "600" },
  actionsContainer: {
    flexDirection: "row",
    paddingHorizontal: wp(5),
    paddingTop: hp(2),
    gap: wp(3),
    paddingBottom: hp(3),
  },
  actionButton: {
    flex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: hp(1.8),
    borderRadius: 14,
    gap: wp(2),
    backgroundColor: "#5B65E1",
  },
  actionLabel: { fontSize: 15, fontWeight: "700", color: "#E3DFDF", letterSpacing: 0.3 },

  offscreen: {
    position: "absolute",
    top: -9999,
    left: 0,
  },

  card: {
    width: 380,
    borderRadius: 28,
    padding: 24,
    alignSelf: "center",
  },
  cardISO: {
    width: wp(99),
    borderRadius: 28,
    paddingHorizontal:wp(2),
    paddingVertical:20,
    alignSelf: "center",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  cardHeaderIOS: {
    width:wp(90),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 73, height: 46 },
  brandName: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  brandSub: { color: "#8b8ba7", fontSize: 11, letterSpacing: 2, marginTop: 2 },
  pill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillText: { color: "#c7c7e0", fontSize: 13 },

  cardQrWrap: { alignItems: "center", marginBottom: 24 },
  cardQrBorder: {
    padding: 4,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardQrInner: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
  },

  cardLabel: {
    color: "#8b8ba7",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: "center",
  },
  cardAddressBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 24,
  },
  cardAddressBoxIOS: {
    width:wp(89),
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 24,
  },
  cardAddress: {
    color: "#e0e0f0",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.3,
  },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  footerLink: { color: "#7ec8ff", fontSize: 13 },
  footerNote: { color: "#6b6b85", fontSize: 12 },
});