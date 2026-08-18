import {
  View,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { useNavigation } from "@react-navigation/native";
import { Exchange_screen_header } from "../../../../reusables/ExchangeHeader";
import Offers_manages from "./Offers_manages";
import { useSelector } from "react-redux";


export const OfferView = () => {
  const navigation = useNavigation();
  const state = useSelector((state) => state);
  return (
    <>
      <Exchange_screen_header title="Pending Adv.Swaps" onLeftIconPress={() => navigation.goBack()} onRightIconPress={() => console.log('Pressed')} />
      <View style={{ height: hp(100), backgroundColor: state.THEME.THEME ? "#0B0B0F" : "#FFFFFF", paddingBottom: hp(15) }}>
        <Offers_manages />
      </View>
    </>
  );
};