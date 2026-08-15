import React, { useEffect, useState } from "react";
import { View, Text, Platform, Image } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { setUser, Extend, Collapse } from "../components/Redux/actions/auth";
import Home2 from "./Home2";
import Settings from "../../Settings";
import Ionicons from "react-native-vector-icons/Ionicons";
import Market from "./Market";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MyHeader from "./MyHeader";
import Wallet from "./Wallet";
import MyHeader2 from "./MyHeader2";
import store from "../components/Redux/Store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { REACT_APP_LOCAL_TOKEN } from "./exchange/crypto-exchange-front-end-main/src/ExchangeConstants";
import { ExchangeNavigation } from "./exchange/crypto-exchange-front-end-main/src/Navigation";
import stellarImg from "../../assets/Stellar_(XLM).png";
import { ExchangeLogin } from "./exchange/crypto-exchange-front-end-main/src/pages/auth/ExchangeLogin";
import { AppHeader } from "./reusables/AppHeader";
import { useIsFocused } from "@react-navigation/native";
import { HomeView } from "./exchange/crypto-exchange-front-end-main/src/pages/home";
import Icon from "../icon";
import { colors } from "../Screens/ThemeColorsConfig";

const Tab = createBottomTabNavigator();

const Dashboard = ({ navigation }) => {
  const Focused_screen=useIsFocused()
  const statee = useSelector((state) => state);
  const extend = useSelector((state) => state.extended);
  const dispatch = useDispatch();
  const [extended, setExtended] = useState(extend);
  const [token, setToken] = useState("");

  const updateState = () => {
    const data = store.getState();
    setState(data);
  };

  const changeState = () => {
    dispatch(Extend())
      .then((response) => {
        if (response.status === "success") {
          updateState();
        }
      })
      .catch((error) => console.error(error));
  };

  const collapseState = () => {
    dispatch(Collapse())
      .then((response) => {
        if (response.status === "success") {
          updateState();
        }
      })
      .catch((error) => console.error(error));
  };

  useEffect(() => {
    const fetchToken = async () => {
      const LOCAL_TOKEN = REACT_APP_LOCAL_TOKEN;
      const token = await AsyncStorage.getItem(LOCAL_TOKEN);
      setToken(token);
    };

    fetchToken();
  }, [Focused_screen]);

  const Header1 = (title, state) => (
    <MyHeader
      title={title}
      state={state}
      changeState={changeState}
      extended={extended}
      setExtended={setExtended}
    />
  );

  const Header2 = (title, state) => (
    <MyHeader2
      title={title}
      state={state}
      changeState={collapseState}
      extended={extended}
      setExtended={setExtended}
    />
  );

  const Header3 = (title) => <AppHeader name={title} />;

  const isDarkMode = statee.THEME.THEME !== false;
  const activeColor = colors.light.buttonColor;
  const inactiveColor = colors.dark.inactiveTx;
  const bgColor = isDarkMode ? colors.dark.cardBg:colors.light.cardBg;

  return (
    <Tab.Navigator
  shifting={false}
  screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,

    tabBarIcon: ({ focused, color, size = 25 }) => {
      let iconName;
      let iconProvider;

      switch (route.name) {
            case "Home":
              iconName = focused?"home":"home-outline";
              iconProvider = "ionicon";
              break;
            case "Wallet":
              iconName = focused?"wallet":"wallet-outline";
              iconProvider = "ionicon";
              break;
            case "Assets":
              iconName = focused?"ios-pie-chart":"ios-pie-chart-outline";
              iconProvider = "ionicon";
              break;
            case "Discover":
              iconName = focused?"candlestick-chart":"candlestick-chart";
              iconProvider = "material";
              break;
            case "Settings":
              iconName = focused?"settings":"settings-outline";
              iconProvider = "ionicon";
              break;
            case "ExchangeHome":
              return (
                <Image
                  source={stellarImg}
                  style={{ width: 50, height: 36 }}
                  resizeMode="contain"
                />
              );
              break;
            default:
              iconName = "ios-home-sharp";
              iconProvider = "ionicon";
          }

          return <Icon name={iconName} type={iconProvider} size={size} color={color} />;
    },

    tabBarLabel: ({ focused }) => {
      const iconColor = focused
        ? (statee.THEME.THEME === false ? "#5B65E1" : "#4052D6")
        : (statee.THEME.THEME === false ? "black" : "#FFF");

      return (
        <Text
          style={{
            color: iconColor,
            fontSize: 16,
            marginTop: 4,
            marginBottom: Platform.OS === "android" ? 8 : 1,
          }}
        >
          {route.name==="ExchangeHome"?"SDEX":route.name}
        </Text>
      );
    },

    tabBarActiveTintColor:
          statee.THEME.THEME === false ? "#5B65E1" : "#4052D6",
        tabBarInactiveTintColor:
          statee.THEME.THEME === false ? "black" : "#FFFF",
    tabBarStyle: {
      position: 'absolute',
      bottom: Platform.OS === 'ios' ? 4 : 8,
      left: 15,
      right: 15,
      height: 75,
      backgroundColor: bgColor,
      borderRadius: 20,
      borderTopWidth: 0,
      paddingBottom: Platform.OS === "android" ? 1 : 10,
      paddingTop: 12,
      elevation: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
    },
    headerTitleAlign: "center",
  })}
>
      <Tab.Screen
        name="Home"
        component={Home2}
        options={{
          tabBarHideOnKeyboard: true,
          header: () =>
            statee.extended === false
              ? Header1("Home", statee)
              : Header2("Home", statee),
          headerShown: true,
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={Wallet}
        options={{
          headerShown: false,
          unmountOnBlur: true,
        }}
      />
      <Tab.Screen
        name="Discover"
        component={Market}
        options={{
          headerShown: false,
          unmountOnBlur: true,
        }}
      />
        <Tab.Screen
          name="ExchangeHome"
          component={HomeView}
          options={{
            headerShown: false,
            unmountOnBlur: true,
          }}
        />
    </Tab.Navigator>
  );
};

export default Dashboard;
