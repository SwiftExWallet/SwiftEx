import {useContext} from 'react';
import {useSelector} from 'react-redux';
import {StyleSheet, Platform} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BottomTabBarHeightContext} from '@react-navigation/bottom-tabs';
import {colors as appColors} from '../Screens/ThemeColorsConfig';

const dark = {
  bg: appColors.dark.bg,
  surface: appColors.dark.cardBg,
  text: appColors.dark.headingTx,
  textSecondary: appColors.dark.inactiveTx,
  primary: appColors.dark.buttonColor,
  success: appColors.dark.success,
  successButton: appColors.dark.success,
  danger: appColors.dark.fail,
  warning: appColors.dark.warn,
  surfaceAlt: '#1E1E27',
  elevated: '#272731',
  border: '#2A2A35',
  textMuted: '#6E7180',
  primarySoft: 'rgba(93,95,239,0.16)',
  primaryFaint: 'rgba(93,95,239,0.08)',
  accentText: '#8F8FFF',
  onPrimary: '#FFFFFF',
  successSoft: 'rgba(52,211,153,0.14)',
  successButtonText: '#05220F',
  dangerSoft: 'rgba(248,113,113,0.14)',
  warningSoft: 'rgba(245,158,11,0.16)',
  cardNavy: '#1A1F3E',
  cardNavyGlow: '#2D3678',
  overlay: 'rgba(255,255,255,0.08)',
  statusBar: 'light-content',
};

const light = {
  bg: appColors.light.bg,
  surface: appColors.light.cardBg,
  text: appColors.light.headingTx,
  textSecondary: appColors.light.inactiveTx,
  primary: appColors.light.buttonColor,
  success: appColors.light.success,
  successButton: appColors.light.success,
  danger: appColors.light.fail,
  warning: appColors.light.warn,
  surfaceAlt: '#EAEAF1',
  elevated: '#E0E0E8',
  border: '#DCDCE5',
  textMuted: '#9A9AA6',
  primarySoft: 'rgba(93,95,239,0.12)',
  primaryFaint: 'rgba(93,95,239,0.06)',
  accentText: '#4F51D8',
  onPrimary: '#FFFFFF',
  successSoft: 'rgba(52,211,153,0.16)',
  successButtonText: '#05220F',
  dangerSoft: 'rgba(248,113,113,0.14)',
  warningSoft: 'rgba(245,158,11,0.16)',
  cardNavy: '#E7E8FD',
  cardNavyGlow: '#C8CAFA',
  overlay: 'rgba(0,0,0,0.05)',
  statusBar: 'dark-content',
};

export const palettes = {dark, light};
export const colors = dark;
export function useVaultColors() {
  const isDark = useSelector(s => (s && s.THEME ? s.THEME.THEME : undefined)) !== false;
  return isDark ? dark : light;
}
export function makeStyles(factory) {
  const cache = new Map();
  return function useStyles() {
    const c = useVaultColors();
    let s = cache.get(c);
    if (!s) {
      s = StyleSheet.create(factory(c));
      cache.set(c, s);
    }
    return s;
  };
}

export function useBottomInset() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const tabSpace = tabBarHeight ? tabBarHeight + (Platform.OS === 'ios' ? 4 : 8) + 8 : 0;
  return Math.max(tabSpace, insets.bottom);
}

export const spacing = {xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24};

export const radius = {sm: 8, md: 12, lg: 16, xl: 20, pill: 999};

export const font = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 28,
  display: 34,
};
