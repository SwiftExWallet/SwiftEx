import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Modal
} from 'react-native';
import { useSelector } from 'react-redux';
import * as StellarSdk from '@stellar/stellar-sdk/axios';
import axios from 'axios';
import { STELLAR_URL } from '../../../../constants';
import { colors } from '../../../../../Screens/ThemeColorsConfig';
const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);

const StellarAccountReserve = ({ 
  isVisible, 
  onClose,
  title = 'Reserved',
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [reserveData, setReserveData] = useState([]);
  const state = useSelector((state) => state);

  const initializeReserveData = async () => {
    try {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await getAccountReserves(state?.STELLAR_PUBLICK_KEY);
     
    } catch (error) {
      console.error('Error initializing reserve data:', error);
      setIsLoading(false);
    }
  };


  async function getAccountReserves(publicKey) {
  try {
    // Fetch account data
    const account = await server.loadAccount(publicKey);

    // Get dynamic base reserve from latest ledger
    const latestLedger = await server.ledgers().order('desc').limit(1).call();
    const baseReserve = parseFloat(latestLedger.records[0].base_reserve_in_stroops) / 10000000;
    
    // Official Stellar formula: (2 + subentries + sponsoring - sponsored) * baseReserve
    const subentryCount = account.subentry_count || 0;
    const numSponsoring = account.num_sponsoring || 0;
    const numSponsored = account.num_sponsored || 0;
    
    const minBalance = (2 + subentryCount + numSponsoring - numSponsored) * baseReserve;
    
    // Get native XLM balance and liabilities (correct offer locking)
    let xlmBalance = 0;
    let sellingLiabilities = 0;
    account.balances.forEach((balance) => {
      if (balance.asset_type === "native") {
        xlmBalance = parseFloat(balance.balance);
        sellingLiabilities = parseFloat(balance.selling_liabilities || '0');
      }
    });

    const transactionBuffer = 0.022; // Your expected buffer
    const totalReserved = minBalance + sellingLiabilities;
    const availableBalance = Math.max(0, xlmBalance - totalReserved - transactionBuffer);

    // Accurate breakdown for UI
    const trustlines = account.balances.length - 1;
    const signers = account.signers?.length - 1 || 0;
    const offers = subentryCount - trustlines - signers; // Derived from subentries
    
    const data = [
      { label: "Reserved:", value: `${totalReserved.toFixed(7)} XLM` },
      { label: "Base Reserve:", value: `${(2 * baseReserve).toFixed(7)} XLM` },
      { label: "Subentries:", value: `${subentryCount} (${(subentryCount * baseReserve).toFixed(7)} XLM)` },
      { label: "Trustlines:", value: `${trustlines} (${(trustlines * baseReserve).toFixed(7)} XLM)` },
      { label: "Offers:", value: `${offers} (${(offers * baseReserve).toFixed(7)} XLM)` },
      { label: "Signers:", value: `${signers} (0 XLM)` },
      { label: "Sponsoring:", value: `${numSponsoring} (${(numSponsoring * baseReserve).toFixed(7)} XLM)` },
      { label: "Sponsored:", value: `${numSponsored} (${(numSponsored * baseReserve).toFixed(7)} XLM)` },
      { label: "XLM in Offers:", value: `${sellingLiabilities.toFixed(7)} XLM` },
      { label: "Buffer:", value: `${transactionBuffer} XLM` },
      { label: "Total Balance:", value: `${xlmBalance.toFixed(7)} XLM` },
      { label: "Available Balance:", value: `${availableBalance.toFixed(7)} XLM` },
    ];

    console.debug({
      baseReserve: baseReserve.toFixed(7),
      subentryCount,
      minBalance: minBalance.toFixed(7),
      sellingLiabilities: sellingLiabilities.toFixed(7),
      totalReserved: totalReserved.toFixed(7),
      availableBalance: availableBalance.toFixed(7)
    });

    setReserveData(data);
    setIsLoading(false);

  } catch (error) {
    console.error("Error fetching account details:", error.message);
    setReserveData([{ label: "Error", value: error.message }]);
    setIsLoading(false);
  }
}

  



  useEffect(() => {
    if (isVisible) {
      initializeReserveData();
    }
  }, [isVisible]);


  const theme = state.THEME.THEME ? colors.dark : colors.light;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={[styles.contentContainer,{backgroundColor:theme.cardBg}]}>
          {/* Header with close button */}
          <View style={styles.header}>
            <Text style={[styles.title,{color:theme.headingTx}]}>{title}</Text>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={[styles.closeButtonText,{color:theme.headingTx}]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4052D6" />
              </View>
            ) : (
              <ScrollView>
                  {reserveData.map((item, index) => (
                    <View key={index} style={[styles.row,{borderBottomColor:theme.bg}]}>
                      <Text style={[styles.label,{color:theme.headingTx}]}>{item.label}</Text>
                      <Text style={[styles.value,{color:theme.headingTx}]}>{item.value}</Text>
                    </View>
                  ))}

              </ScrollView>
            )}
          </View>

          {/* Bottom button */}
          <TouchableOpacity 
            style={styles.doneButton}
            onPress={onClose}
          >
            <Text style={styles.doneButtonText}>Okay</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  contentContainer: {
    flex: 1,
    marginTop: "50%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    // color: '#333333',
    color:"#fff",
    flex: 1,
  },
  totalReserve: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
    marginRight: 16,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    // color: '#666666',
    color:"#fff"
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: 16,
    // color: '#333333',
    color:"#fff",
  },
  value: {
    fontSize: 16,
    // color: '#333333',
    color:"#fff",
  },
  moreInfo: {
    padding: 16,
  },
  moreInfoText: {
    color: '#007AFF',
    fontSize: 16,
  },
  doneButton: {
    backgroundColor: '#4052D6',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default StellarAccountReserve;