import React, { useEffect, useRef } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Share, Dimensions, Animated, TouchableWithoutFeedback } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Clipboard from '@react-native-clipboard/clipboard';
import darkBlue from "../../../assets/darkBlue.png"
import { alert } from "../reusables/Toasts";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import LinearGradient from "react-native-linear-gradient";

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const TokenQrCode = ({ modalVisible, setModalVisible, iconType, qrvalue, isDark }) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (modalVisible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [modalVisible]);

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setModalVisible(false));
  };

  const copyToClipboard = () => {
    Clipboard.setString(qrvalue);
    alert('success', 'Address copied successfully!');
    closeModal();
  };

  const shareQR = async () => {
    try {
      await Share.share({
        message: JSON.stringify({
          Wallet: iconType,
          Address: qrvalue
        }, null, 2)
      });
    } catch (error) {
      console.log('Error sharing QR code', error);
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
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: opacityAnim,
            },
          ]}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.bottomSheet,
                {
                  backgroundColor: isDark ? '#0B0B0F' : '#F4F4F8',
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.handleBar}>
                <View
                  style={[
                    styles.handle,
                    { backgroundColor: isDark ? '#3A3A4C' : '#E0E0E0' },
                  ]}
                />
              </View>

              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View>
                    <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#212529' }]}>
                      Receive {iconType}
                    </Text>
                    <Text style={[styles.subtitle, { color: isDark ? '#8B93A7' : '#6C757D' }]}>
                      Scan or share QR code
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={closeModal} style={[styles.closeButton,{backgroundColor:isDark ?'#000':'#FFF'}]}>
                  <Icon name="close" size={24} color={isDark ?'#FFF':'#000'} />
                </TouchableOpacity>
              </View>

              <View style={styles.qrSection}>
                <View style={[styles.qrWrapper, { backgroundColor:'#FFFFFF' }]}>
                  <QRCode
                    value={qrvalue}
                    size={wp(45)}
                    logoBorderRadius={10}
                  />
                </View>

                <Text style={[styles.middleHeading,{color:isDark?"#fff":"#272729",}]}>Your {iconType} Address</Text>
                <Text style={[styles.middleSubHeading,{color:isDark?"gray":"#3F3F41",}]}>Use this address to receive tokens on {iconType}</Text>

                <View style={[styles.addressContainer, { backgroundColor: isDark ? '#242426' : '#FFFFFF' }]}>
                  <Text style={[styles.addressText, { color: isDark ? '#FFFFFF' : '#212529' }]} numberOfLines={1} ellipsizeMode="middle">
                    {`${qrvalue.slice(0, 15)}......${qrvalue.slice(-15)}`}
                  </Text>
                  <TouchableOpacity
                    onPress={copyToClipboard}
                  >
                    <Icon name="content-copy" size={24} color={isDark ? '#FFFFFF' : '#212529'} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.actionsContainer}>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={shareQR}
                  activeOpacity={0.7}
                >
                  <View style={styles.outlineButton}>
                    <Text style={styles.actionLabel}>
                      Share
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: hp(4),
    maxHeight: SCREEN_HEIGHT * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20,
  },
  handleBar: {
    alignItems: 'center',
    paddingVertical: hp(1.5),
  },
  handle: {
    width: wp(12),
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: wp(5),
    paddingBottom: hp(2),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(3),
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  closeButton: {
    padding: wp(1),
    borderRadius:50
  },
  qrSection: {
    paddingHorizontal: wp(5),
    alignItems: 'center',
  },
  qrContainer: {
    padding: wp(6),
    borderRadius: 24,
    borderWidth: 2,
    position: 'relative',
    marginBottom: hp(2),
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  qrWrapper: {
    padding: wp(4),
    borderRadius: 16,
  },
  cornerTL: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 20,
    height: 20,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 20,
    height: 20,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 20,
    height: 20,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 20,
    height: 20,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: wp(90),
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.5),
    borderRadius: 12,
    gap: wp(2),
    marginTop:10
  },
  walletIcon: {
    opacity: 0.7,
  },
  addressText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  actionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: wp(5),
    paddingTop: hp(2),
    gap: wp(3),
    paddingBottom:hp(3)
  },
  actionButton: {
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  gradientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(1.8),
    borderRadius: 14,
    gap: wp(2),
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(1.8),
    borderRadius: 14,
    gap: wp(2),
    backgroundColor: "#5B65E1"
  },
  actionIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E3DFDF',
    letterSpacing: 0.3,
  },
  middleHeading:{
    marginTop:29,
    fontSize:20
  },
  middleSubHeading:{
    fontSize:14,
    marginBottom:20
  }
});

export default TokenQrCode;