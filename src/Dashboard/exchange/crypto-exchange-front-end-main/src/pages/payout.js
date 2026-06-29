import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { Exchange_screen_header } from "../../../../reusables/ExchangeHeader";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { colors } from "../../../../../Screens/ThemeColorsConfig";

const Payout = () => {
  const state = useSelector((state) => state);
  const Anchors = [
    { name: "Alchemy Pay", image: require('../../../../../../assets/AlcamyPay.jpg'), domain: "alchemypay.org",screenPath:"KycComponent" },
    { name: "MoonPay", image: require('../../../../../../assets/MoonPay.png'), domain: "moonpay.com",screenPath:"RampProvider" },
    { name: "Banxa", image: require('../../../../../../assets/BANXA.png'), domain: "banxa.com",screenPath:"BanxaRampProvider" },
  ];
  const navigation = useNavigation();


  const theme = state.THEME.THEME ? colors.dark : colors.light;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Exchange_screen_header title="Select Anchor" onLeftIconPress={() => navigation.goBack()} onRightIconPress={() => console.log('Pressed')} />
      <View style={[styles.listCon, { backgroundColor: theme.cardBg, borderColor: theme.smallCardBorderColor }]}>
        <Text style={[styles.headingTx, { color: theme.headingTx }]}>Select Anchors</Text>
        {Anchors.map((list, index) => {
          return (
            <TouchableOpacity style={[styles.card, { backgroundColor: theme.bg }]} key={index} onPress={() => { navigation.navigate(list.screenPath, { tabName: "Buy" })}}>
              <Image source={list.image} style={styles.image} resizeMode="cover" />
              <View style={styles.subCon}>
                <Text style={[styles.cardHeading, { color: theme.headingTx }]}>{list.name}</Text>
                <Text style={[styles.cardSubTx, { color: theme.inactiveTx }]}>{list.domain}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}
const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  listCon: {
    paddingVertical: hp(1),
    paddingHorizontal: wp(4),
    borderRadius: 20,
    marginVertical: hp(1),
    marginHorizontal: wp(4),
    borderWidth: 1
  },
  headingTx: {
    fontSize: 19,
    marginVertical: hp(0.5)
  },
  image: {
    width: wp(17),
    height: hp(6.5),
    alignSelf: "center",
    borderRadius: 15,
  },
  subCon: {
    marginLeft: 10,
    alignItems: "flex-start",
    justifyContent: "center"
  },
  cardHeading: {
    fontSize: 19,
    fontWeight: "500"
  },
  cardSubTx: {
    fontSize: 15,
    fontWeight: "500"
  },
  card: {
    marginTop:hp(1),
    borderRadius: 20,
    flexDirection: "row",
    alignContent: "center",
    padding: 10
  }
})

export default Payout;