import { useIsFocused } from '@react-navigation/native';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Button,
  Alert,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Keyboard,
  ScrollView,
  NativeModules,
} from 'react-native';
import { useSelector } from 'react-redux';
import * as StellarSdk from '@stellar/stellar-sdk';
import Icon from '../../../../../icon';
import Snackbar from 'react-native-snackbar';
import { GetStellarAvilabelBalance, GetStellarUSDCAvilabelBalance } from '../../../../../utilities/StellarUtils';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import BigNumber from 'bignumber.js';
import { ENVIRONMENT, STELLAR_URL } from '../../../../constants';
import CustomInfoProvider from '../components/CustomInfoProvider';
import { colors } from '../../../../../Screens/ThemeColorsConfig';

const STELLAR_NETWORK = ENVIRONMENT==="TESTNET"?StellarSdk.Networks.TESTNET:StellarSdk.Networks.PUBLIC;

const Offers_manages = () => {
  const state = useSelector((state) => state);
  const isFocused = useIsFocused();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sellingAssetCode, setSellingAssetCode] = useState('');
  const [buyingAssetCode, setBuyingAssetCode] = useState(''); 
  const [buyingAssetIssuer, setBuyingAssetIssuer] = useState('');
  const [sellingAssetIssuer, setsellingAssetIssuer] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [SelectedIndex, setSelectedIndex] = useState(null);
  const [newAmount, setNewAmount] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [STELLAR_ACCOUNT_PUBLIC,setSTELLAR_ACCOUNT_PUBLIC]=useState('');
  const [STELLAR_ACCOUNT_SECRET,setSTELLAR_ACCOUNT_SECRET]=useState('');
  const [loading_del,setloading_del]=useState(false);
  const [loading_edi,setloading_edi]=useState(false);
  const [stellarAvalibleBalance,setstellarAvalibleBalance]=useState('');
  const [reserveLoading,setreserveLoading]=useState(false);
  const [lastOfferAmount,setlastOfferAmount]=useState('');


  const server = new StellarSdk.Horizon.Server(STELLAR_URL.URL);

  useEffect(() => {
    setLoading(true);
    setOffers([])
    setlastOfferAmount('')
    setreserveLoading(false);
    setstellarAvalibleBalance('');
    setSelectedIndex(null)
    setloading_del(false);
    setloading_edi(false);
    setSTELLAR_ACCOUNT_PUBLIC(state.STELLAR_PUBLICK_KEY);
    setSTELLAR_ACCOUNT_SECRET(state.STELLAR_SECRET_KEY);
    fetchOffers();
  }, [isFocused]);


  const theme = state.THEME.THEME ? colors.dark : colors.light;


  const fetchAvilableBalance=async(asset,coinName,assetIssuer)=>{
    if(asset==="native")
    {
      GetStellarAvilabelBalance(state?.STELLAR_PUBLICK_KEY).then((result) => {
        setstellarAvalibleBalance(result?.availableBalance).toFixed(5)
        setreserveLoading(false)
        }).catch(error => {
          console.log('Error loading account:', error);
          setreserveLoading(false)
      });
    }
    if(asset==="credit_alphanum4")
    {
      GetStellarUSDCAvilabelBalance(state?.STELLAR_PUBLICK_KEY,coinName,assetIssuer).then((result) => {
        setstellarAvalibleBalance(result?.availableBalance).toFixed(5)
        setreserveLoading(false)
        }).catch(error => {
          console.log('Error loading account:', error);
          setreserveLoading(false)
      });
    }
  }

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const apiUrl = `${STELLAR_URL.URL}/accounts/${state?.STELLAR_PUBLICK_KEY}/offers?limit=200&order=desc`;
      const response = await axios.get(apiUrl);
      const fetchedOffers = response.data._embedded?.records || [];

      if (fetchedOffers.length > 0) {
        const firstOffer = fetchedOffers[0];
        let sellingAssetCode;
        let buyingAssetCode;
        let buyingAssetIssuer;
        let sellingAssetIssuer;

        if (firstOffer.selling) {
          const sellingAssetType = firstOffer.selling.asset_type;

          sellingAssetCode = sellingAssetType === 'native' ? 'XLM' : firstOffer.selling.asset_code ;
          sellingAssetIssuer = firstOffer.selling.asset_issuer || 'Unknown Issuer';

        }

        if (firstOffer.buying) {
          const buyAssetType = firstOffer.buying.asset_type;
          buyingAssetCode = buyAssetType === 'native' ? firstOffer.buying?.asset_type:firstOffer.buying?.asset_code;

          buyingAssetIssuer = firstOffer.buying.asset_issuer || 'Unknown Issuer';
        }

        setSellingAssetCode(sellingAssetCode);
        setBuyingAssetCode(buyingAssetCode); 
        setBuyingAssetIssuer(buyingAssetIssuer); 
        setsellingAssetIssuer(sellingAssetIssuer)
      }
      console.log("---fetchOffers-----",fetchedOffers)
      setOffers(fetchedOffers);
    } catch (error) {
      console.log('Error fetching offer data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (offerId,index) => {
    setSelectedIndex(index)
   CustomInfoProvider.show(
      'Delete Request',
      'Are you sure you want to delete this request?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'OK', onPress: () => deleteOffer(offerId) },
      ]
    );
  };

  const deleteOffer = async (offer) => {
    console.log("==--------lppp",sellingAssetCode,buyingAssetCode)
    setloading_del(true);
    try {
      const account = await server.loadAccount(state.STELLAR_PUBLICK_KEY);
  
      const selling =
        offer.selling.asset_type === "native"
          ? StellarSdk.Asset.native()
          : new StellarSdk.Asset(offer.selling.asset_code, offer.selling.asset_issuer);
  
      const buying =
        offer.buying.asset_type === "native"
          ? StellarSdk.Asset.native()
          : new StellarSdk.Asset(offer.buying.asset_code, offer.buying.asset_issuer);
  
      const op = StellarSdk.Operation.manageSellOffer({
        offerId: offer.id,
        selling,
        buying,
        amount: "0",
        price: "1",
      });
  
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: await server.fetchBaseFee(),
        networkPassphrase: STELLAR_NETWORK,
      })
        .addOperation(op)
        .setTimeout(30)
        .build();

      const txXDR = transaction.toXDR();
      const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
      const signatureBuffer = Buffer.from(signedTx.signature, 'base64');
      transaction.addSignature(signedTx.publicKey, signatureBuffer.toString('base64'));
      const response = await server.submitTransaction(transaction);
      console.log('Offer deleted:', response);
      setloading_del(false);
      fetchOffers(); 
     CustomInfoProvider.show('Success', 'Request successfull.');
    } catch (error) {
      setloading_del(false);
      console.log("Error deleting offer:", error);
     CustomInfoProvider.show('Info', 'Failed to delete the request.');
    }
  };

  const handleEdit = (offer,index) => {
    setlastOfferAmount(Number(offer.amount).toFixed(5))
    setreserveLoading(true)
    fetchAvilableBalance(offer?.selling?.asset_type,offer?.selling?.asset_code,offer?.selling?.asset_issuer)
    setSelectedIndex(index)
    setSelectedOffer(offer);
    setNewAmount(Number(offer.amount).toFixed(7));
    setNewPrice(Number(offer.price).toFixed(7));
    setModalVisible(true);
  };

  const isValidNumber = (value) => {
    if (value === null || value === undefined) return false;
    if (value === "" || value === ".") return false;
    const num = new BigNumber(value);
    if (!num.isFinite() || num.isNaN()) return false;
    if (num.lte(0)) return false;
    if (num.decimalPlaces() > 7) return false;
    return true;
  };

  const updateOffer = async () => {
    Keyboard.dismiss();
  
    const newAmountBN = BigNumber(newAmount || 0);
    const lastOfferAmountBN = BigNumber(lastOfferAmount || 0);
    const stellarAvailableBalanceBN = BigNumber(stellarAvalibleBalance || 0);
  
    if (newAmountBN.gt(lastOfferAmountBN.plus(stellarAvailableBalanceBN))) {
      Snackbar.show({
        text: 'Insufficient balance',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
      });
      return;
    }
    if (!isValidNumber(newAmountBN) || !isValidNumber(newPrice)) {
      Snackbar.show({
        text: 'Invalid value provided',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
      });
      return;
    }
    
    setloading_edi(true);

  
    try {
      const account = await server.loadAccount(state.STELLAR_PUBLICK_KEY);
  
      const selling =
        sellingAssetCode === "XLM" || sellingAssetCode === "native"
          ? StellarSdk.Asset.native()
          : new StellarSdk.Asset(sellingAssetCode, sellingAssetIssuer);
  
      const buying =
        buyingAssetCode === "XLM" || buyingAssetCode === "native"
          ? StellarSdk.Asset.native()
          : new StellarSdk.Asset(buyingAssetCode, buyingAssetIssuer);
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: await server.fetchBaseFee(),
        networkPassphrase: STELLAR_NETWORK,
      })
        .addOperation(
          StellarSdk.Operation.manageSellOffer({
            offerId: selectedOffer.id,
            selling,
            buying,
            amount: newAmountBN.toString(),
            price: BigNumber(newPrice).toString(),
          })
        )
        .setTimeout(30)
        .build();
  
      const txXDR = transaction.toXDR();
      const signedTx = await NativeModules.StellarSigner.signTransaction(txXDR);
      const signatureBuffer = Buffer.from(signedTx.signature, 'base64');
      transaction.addSignature(signedTx.publicKey, signatureBuffer.toString('base64'));
  
      const response = await server.submitTransaction(transaction);
      console.log('Offer updated:', response);
  
      setloading_edi(false);
      fetchOffers();
     CustomInfoProvider.show('Success', 'Request updated successfully.');
      setModalVisible(false);
    } catch (error) {
      setloading_edi(false);
      console.log("Error updating offer:", error.response?.data || error);
     CustomInfoProvider.show('Info', 'Failed to update the request.');
    }
  };
  
  

  const renderItem = ({ item,index }) => (
    <View style={[styles.offerItem, { backgroundColor: theme.cardBg }]}>
      <View style={styles.offer_id_con}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[styles.offerText, { color: theme.headingTx }]}>Swap ID: {item.id}</Text>
          <View style={styles.active_text}>
            <Text style={[styles.offerText, { color: "#fff", fontSize: 13 }]}>Active</Text>
          </View>
        </View>
        <View style={styles.buttonContainer}>
          {loading_edi && SelectedIndex === index ? <ActivityIndicator color={"green"} size={"small"} /> :
            <TouchableOpacity style={{ marginRight: 15 }} disabled={loading_del} onPress={() => handleEdit(item, index)}>
              <Icon name={"edit"} type={"antDesign"} size={25} color={"#AA2022"} />
            </TouchableOpacity>}
          {loading_del && SelectedIndex === index ? <ActivityIndicator color={"green"} size={"small"} /> :
            <TouchableOpacity disabled={loading_edi} onPress={() => handleDelete(item, index)}>
              <Icon name={"delete"} type={"antDesign"} size={25} color={"#40BF6A"} />
            </TouchableOpacity>}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{flexDirection:"row",alignItems:"center",justifyContent:"center"}}>
        <View style={styles.container_sub}>
          <Text style={[styles.offerText, { color: theme.inactiveTx }]}>Send Asset</Text>
          <Text style={[styles.offerSubText, { color: theme.headingTx }]}>{item?.selling?.asset_type === "native" ? "XLM" : item.selling?.asset_code}</Text>
        </View>
        <View style={styles.container_sub}>
          <Text style={[styles.offerText, { color: theme.inactiveTx }]}>Receive Asset</Text>
          <Text style={[styles.offerSubText, { color: theme.headingTx }]}>{item?.buying?.asset_type === "native" ? "XLM" : item.buying?.asset_code}</Text>
        </View>
        <View style={styles.container_sub}>
          <Text style={[styles.offerText, { color: theme.inactiveTx }]}>Amount</Text>
          <Text style={[styles.offerSubText, { color: theme.headingTx }]}>{Number(item.amount).toFixed(5)}</Text>
        </View>
        <View style={styles.container_sub}>
          <Text style={[styles.offerText, { color: theme.inactiveTx }]}>Price</Text>
          <Text style={[styles.offerSubText, { color: theme.headingTx }]}>{Number(item.price).toFixed(5)}</Text>
        </View>

      </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.container,{backgroundColor:theme.bg}]}>
      {loading ? (
        <ActivityIndicator color={"#4052D6"} size={"large"}/>
      ) : (
        offers.length>0?<FlatList
          data={offers}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          style={styles.offerList}
        />:
        <View style={styles.error_cont}>
          <Icon name={"cart-outline"} type={"materialCommunity"} size={55} color={theme.inactiveTx} />
          <Text style={[styles.error_text,{color:theme.inactiveTx}]}>No Pending Adv. Swaps</Text>
        </View>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(!modalVisible);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
          <TouchableOpacity style={{alignSelf:"flex-end"}} onPress={()=>{setModalVisible(false)}}>
          <Icon name={"close"} type={"antDesign"} size={25} color={"#fff"}/>
          </TouchableOpacity>
            <View style={styles.container_sub}>
            <Text style={styles.modalTitle}>Edit Swap</Text>
            <Text style={styles.modalTitle}>Swap ID: {selectedOffer?.id}</Text>
            </View>
            <TextInput
              editable={!loading_edi}
              style={styles.input}
              placeholder="New Amount"
              placeholderTextColor={"gray"}
              value={newAmount}
              onChangeText={(input)=>{
                const replaceComma = input.replace(',', '.');
                const filteredValue = replaceComma.replace(/[^0-9.]/g, '');
                setNewAmount(filteredValue);
              }}
              keyboardType="numeric"
              returnKeyType='done'
            />
            <TextInput
              editable={!loading_edi}
              style={styles.input}
              placeholder="New Price"
              placeholderTextColor={"gray"}
              value={newPrice}
              onChangeText={(input) => {
                const replaceComma = input.replace(',', '.');
                const filteredValue = replaceComma.replace(/[^0-9.]/g, '');
                setNewPrice(filteredValue);
              }}
              keyboardType="numeric"
              returnKeyType='done'
            />
             <View style={{ flexDirection: "row" ,marginBottom: 15,}}><Text style={styles.balance}>Balance: </Text>
              {reserveLoading ? <ActivityIndicator color={"green"} /> :
                  <Text style={styles.balance}>{stellarAvalibleBalance ? Number(stellarAvalibleBalance) : 0.0} </Text>}
            </View>
            <TouchableOpacity style={styles.update_btn} disabled={loading_edi||reserveLoading} onPress={()=>{updateOffer()}}>
              {loading_edi?<ActivityIndicator color={"green"} size={"small"}/>:<Text style={{color:"#4B84ED",fontSize:19}}>Update Swap</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#011434',
  },
  title: {
    fontSize: 23,
    fontWeight: '500',
    marginBottom: 20,
    textAlign: 'left',
    color: '#fff',
  },
  input: {
    height: 50,
    borderColor: '#ced4da',
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    color:"black"
  },
  offerItem: {
    borderRadius: 15,
    marginBottom: 15
  },
  offerText: {
    fontSize: 15,
    fontWeight:"500"
  },
  offerSubText: {
    fontSize: 13,
    fontWeight:"500",
    textAlign:"left"
  },
  offerList: {
    marginTop: 10,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalContent: {
    width: '100%',
    height:"70%",
    padding: 20,
    borderRadius: 10,
    backgroundColor: '#1F2022',
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '500',
    marginBottom: 15,
    textAlign: 'center',
    color:"#fff"
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal:10,
  },
  buttonView:{
    alignContent:"center",
    justifyContent:"center",
    alignItems:"center",
    width:80,
    height:30,
    borderRadius:10
  },
  error_cont:{
    justifyContent:"center",
    alignSelf:"center",
    alignItems:"center",
    paddingVertical:90
  },
  error_text:{
    color:"gray",
    fontSize:20
  },
  container_sub:{
    justifyContent:"space-between",
    flexDirection:"column",
    alignItems:"center",
    paddingHorizontal: 12,
    paddingTop:5,
    paddingBottom:15
  },
  offer_id_con:{
    justifyContent:"space-between",
    flexDirection:"row",
    paddingVertical:14,
    paddingHorizontal: 15,
    borderBottomColor:"gray",
    borderBottomWidth:0.5,
    marginBottom:8
  },
  active_text:{
    backgroundColor:"#1D5F33",
    paddingHorizontal:wp(2),
    paddingVertical:hp(0.4),
    alignItems:"center",
    justifyContent:"center",
    borderRadius:8,
    marginLeft:4
  },
  update_btn:{
    alignSelf:"center",
    alignItems:"center",
    width:"90%",
    padding:15,
    borderColor:"#fff",
    borderWidth:1,
    borderRadius:15,
    marginTop:13
  },
  balance: {
    color: "#fff",
    textAlign: "center",
    fontSize: hp(2),
  },
});

export default Offers_manages;
