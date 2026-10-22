import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import { colors } from '../../../../../Screens/ThemeColorsConfig';
import { Exchange_screen_header } from '../../../../reusables/ExchangeHeader';
import Classic from './classic';
import ExportUSDC from './ExportUsdc';
import BridgeScreen from './BridgeScreen';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SCREEN_REGISTRY = {
  deposit: {
    key: 'deposit',
    label: 'Deposit',
    component: Classic,
  },
  depositCCTP: {
    key: 'depositCCTP',
    label: 'CCTP',
    component: BridgeScreen,
    directionEnable: 'EVM_TO_STELLAR',
  },
  withdraw: {
    key: 'withdraw',
    label: 'Withdraw',
    component: ExportUSDC,
  },
  withdrawCCTP: {
    key: 'withdrawCCTP',
    label: 'CCTP',
    component: BridgeScreen,
    directionEnable: 'STELLAR_TO_EVM',
  },
};


export default function BridgeTabScreen({ route, ...props }) {
  const navigation = useNavigation();
  const isScreenFocused = useIsFocused();
  const state = useSelector(s => s);
  const isDark = state.THEME.THEME;
  const theme = isDark ? colors.dark : colors.light;
  const { tabs: tabKeys = ['deposit', 'withdraw'], title = 'Bridge', } = route?.params || {};
  const tabs = tabKeys.map(key => SCREEN_REGISTRY[key]).filter(Boolean);
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || '');
  const underlineX = useRef(new Animated.Value(0)).current;
  const tabWidth = SCREEN_WIDTH / Math.max(tabs.length, 1);
  const handleTabPress = (key, index) => {
    setActiveTab(key);
    Animated.spring(underlineX, { toValue: index * tabWidth, useNativeDriver: true, tension: 60, friction: 10, }).start();
  };
  return (
    <View style={[s.root, { backgroundColor: theme.bg }]}>
      <Exchange_screen_header title={title} onLeftIconPress={() => navigation.goBack()} onRightIconPress={() => { }} />
      {tabs.length > 1 && <View style={[s.tabBar, { backgroundColor: theme.cardBg }]}>
        {tabs.map(
          (tab, index) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity key={tab.key} style={s.tabBtn} activeOpacity={0.75} onPress={() => handleTabPress(tab.key, index)}>
                <Text style={[s.tabLabel, { color: isActive ? '#4F46E5' : theme.inactiveTx, }, isActive && s.tabLabelActive,]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          }
        )}
        <Animated.View style={[s.underline, { backgroundColor: '#4F46E5', width: tabWidth, transform: [{ translateX: underlineX, }] }]} />
      </View>}

      {tabs.map(tab => {
        const Component = tab.component;
        if (!Component) {
          return null;
        }
        return (
          <View
            key={tab.key}
            style={[s.screenWrapper, { display: activeTab === tab.key ? 'flex' : 'none', },]}>
            <Component
              {...props}
              hideHeader
              themeMode={isDark}
              evmAddress={state?.wallet?.address}
            stellarAddress={state?.STELLAR_PUBLICK_KEY}
            directionEnable={tab.directionEnable}
            isActive={isScreenFocused && activeTab === tab.key}
          />
          </View>
        );
      })}
    </View>
  );
}


const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 50,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  screenWrapper: {
    flex: 1,
  },
});
