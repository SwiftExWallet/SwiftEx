import React, { useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Animated,
} from 'react-native';
import SelectWallet from "./Modals/SelectWallet";
import NewWalletModal from "./Modals/newWallet";
import walletImage from "../../assets/walletImage.png";
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { colors } from '../Screens/ThemeColorsConfig';
import { Wallet_screen_header } from './reusables/ExchangeHeader';

const Wallet = () => {
  const navigation = useNavigation();
  const foucuse = useIsFocused();
  const [visible, setVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newWalletModal, setNewWalletModal] = useState(false);
  const state = useSelector((state) => state);
  const theme = state.THEME.THEME ? colors.dark : colors.light;
  const styles = useMemo(() => getStyles(theme), [theme]);

  useEffect(() => {
    setNewWalletModal(false);
  }, [foucuse])
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Wallet_screen_header title="Wallet" onLeftIconPress={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.heroContainer}>
          <View style={styles.illustrationPlaceholder}>
            <Animated.Image
              style={styles.imageCon}
              source={walletImage}
            />
          </View>

          <Text style={styles.title}>Private and Secure</Text>
          <Text style={styles.subtitle}>
            Buy crypto to get started{"\n"}and grow your portfolio
          </Text>

          <TouchableOpacity style={styles.mainButton} onPress={()=>{navigation.navigate("payout")}}>
            <Text style={styles.mainButtonText}>Buy Assets</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listCard}>
          <ActionRow
            styles={styles}
            icon="wallet-outline"
            title="My Wallet"
            sub="View and manage your wallet"
            IconLib={MaterialCommunityIcons}
            onPress={() => navigation.navigate("MyWallet")}
          />
          <ActionRow
            styles={styles}
            icon="plus"
            title="Create Wallet"
            sub="Start fresh with new wallet"
            IconLib={MaterialCommunityIcons}
            onPress={() => setNewWalletModal(true)}
          />
          <ActionRow
            styles={styles}
            icon="cloud-download-outline"
            title="Import Wallet"
            sub="Restore from seed or private key"
            IconLib={MaterialCommunityIcons}
            onPress={() => navigation.navigate("WalletNetworkSelection", { selectionType: "importForSetupedApp", backScreenName: "Home" })}
          />
          <ActionRow
            styles={styles}
            icon="swap-horizontal"
            title="Choose Wallet"
            sub="Select an existing wallet"
            IconLib={MaterialCommunityIcons}
            isLast
            onPress={() => { navigation.navigate("AllWallets") }}
          />
        </View>

      </ScrollView>
      <SelectWallet
        visible={visible}
        setVisible={setVisible}
        setModalVisible={setModalVisible}
      />
      <NewWalletModal
        visible={newWalletModal}
        onCrossPress={() => { setNewWalletModal(false) }}
        setVisible={setNewWalletModal}
        setModalVisible={setModalVisible}
      />
    </View>
  );
};

const ActionRow = ({ styles, icon, title, sub, IconLib, isLast, onPress }) => (
  <TouchableOpacity
    style={[styles.row, isLast && { borderBottomWidth: 0 }]}
    onPress={onPress}
  >
    <View style={styles.rowIconBg}>
      <IconLib name={icon} size={22} color={colors.dark.buttonColor} />
    </View>
    <View style={styles.rowTextContainer}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowSubText}>{sub}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={styles.chevronColor.color} />
  </TouchableOpacity>
);

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  walletSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  walletName: {
    color: 'white',
    fontWeight: '600',
    marginHorizontal: 8,
    fontSize: 15,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 15,
  },
  iconCircle: {
    padding: 4,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 50,
  },
  heroContainer: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
  },
  illustrationPlaceholder: {
    width: 200,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  mockWallet: {
    width: 120,
    height: 80,
    backgroundColor: theme.smallCardBg,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.smallCardBorderColor,
  },
  mockCoin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.smallCardBg,
    marginBottom: -20,
    zIndex: 1,
  },
  title: {
    color: theme.headingTx,
    fontSize: 23,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  subtitle: {
    color: theme.cardSubTx,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 15,
  },
  mainButton: {
    backgroundColor: colors.dark.buttonColor,
    width: '90%',
    paddingVertical: 15,
    borderRadius: 20,
    alignItems: 'center',
  },
  mainButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  listCard: {
    backgroundColor: theme.cardBg,
    width: '92%',
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 2
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.smallCardBorderColor,
  },
  rowIconBg: {
    width: 44,
    height: 44,
    backgroundColor: theme.bg,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  rowTextContainer: {
    flex: 1,
  },
  rowTitle: {
    color: theme.headingTx,
    fontSize: 16,
    fontWeight: '600',
  },
  rowSubText: {
    color: theme.cardSubTx,
    fontSize: 14,
    marginTop: 2,
  },
  imageCon: {
    width: wp(65),
    height: hp(18),
    alignSelf: "center",
    marginTop: hp(1)
  },
  chevronColor: {
    color: theme.cardSubTx,
  },
});

export default Wallet;