import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Image,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useVaultColors, makeStyles, useBottomInset, radius, spacing, font} from '../theme';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

function useKeyboardVisible(enabled) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setVisible(true));
    const b = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, [enabled]);
  return visible;
}

export function Screen({header, children, footer, scroll = true, contentStyle, keyboard = false}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tabInset = useBottomInset();
  const kbVisible = useKeyboardVisible(keyboard);
  const bottomInset = kbVisible ? 0 : tabInset;
  const flat = StyleSheet.flatten(contentStyle) || {};
  const basePad = flat.paddingBottom != null ? flat.paddingBottom : spacing.xxl;
  const contentPad = footer ? null : {paddingBottom: basePad + bottomInset};

  const body = (
    <>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, contentStyle, contentPad]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.content, contentStyle, contentPad]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, {paddingBottom: spacing.lg + bottomInset}]}>{footer}</View> : null}
    </>
  );

  return (
    <View style={[styles.safe]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />
      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

export function Header({title, onBack, backIcon = 'chevron-back', rightIcon, onRightPress, left, right}) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {left || (onBack ? <IconButton name={backIcon} onPress={onBack} /> : null)}
      </View>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.headerSide, styles.headerRight]}>
        {right || (rightIcon ? <IconButton name={rightIcon} onPress={onRightPress} size={20} /> : null)}
      </View>
    </View>
  );
}

export function IconButton({name, onPress, size = 22, color, style}) {
  const colors = useVaultColors();
  const styles = useStyles();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
      style={[styles.iconBtn, style]}>
      <Ionicons name={name} size={size} color={color || colors.text} />
    </TouchableOpacity>
  );
}

export function Card({children, style, onPress}) {
  const styles = useStyles();
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.card, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export const Divider = ({style}) => {
  const styles = useStyles();
  return <View style={[styles.divider, style]} />;
};

export const Spacer = ({h = spacing.lg}) => <View style={{height: h}} />;

export function SectionHeader({title, actionLabel, onAction, style}) {
  const styles = useStyles();
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const getVariants = colors => ({
  primary: {bg: colors.primary, fg: colors.onPrimary},
  success: {bg: colors.successButton, fg: colors.successButtonText},
  danger: {bg: colors.danger, fg: colors.onPrimary},
  secondary: {bg: colors.surfaceAlt, fg: colors.text},
  outline: {bg: 'transparent', fg: colors.text, border: colors.border},
  ghost: {bg: 'transparent', fg: colors.textSecondary},
});

export function Button({label, onPress, variant = 'primary', icon, disabled, loading, size = 'lg', style}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const VARIANTS = getVariants(colors);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const h = size === 'sm' ? 34 : size === 'md' ? 44 : 52;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        {
          height: h,
          backgroundColor: v.bg,
          borderColor: v.border || 'transparent',
          borderWidth: v.border ? 1 : 0,
          paddingHorizontal: size === 'sm' ? 14 : 20,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={v.fg} style={styles.btnIcon} /> : null}
          <Text style={[styles.btnText, {color: v.fg, fontSize: size === 'sm' ? 13 : 15}]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function Tabs({tabs, active, onChange, style}) {
  const styles = useStyles();
  return (
    <View style={[styles.tabs, style]}>
      {tabs.map(t => {
        const on = t.key === active;
        return (
          <TouchableOpacity key={t.key} onPress={() => onChange(t.key)} style={styles.tab} activeOpacity={0.7}>
            <Text style={[styles.tabText, on && styles.tabTextActive]}>
              {t.label}
              {t.count != null ? ` (${t.count})` : ''}
            </Text>
            <View style={[styles.tabLine, on && styles.tabLineActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ChipGroup({options, value, onChange, style}) {
  const styles = useStyles();
  return (
    <View style={[styles.chipGroup, style]}>
      {options.map(o => {
        const key = typeof o === 'string' ? o : o.key;
        const label = typeof o === 'string' ? o : o.label;
        const on = key === value;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            activeOpacity={0.8}
            style={[styles.chip, on && styles.chipActive]}>
            <Text style={[styles.chipText, on && styles.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const getBadgeTones = colors => ({
  green: {bg: colors.successSoft, fg: colors.success},
  yellow: {bg: colors.warningSoft, fg: colors.warning},
  red: {bg: colors.dangerSoft, fg: colors.danger},
  primary: {bg: colors.primarySoft, fg: colors.accentText},
  grey: {bg: colors.elevated, fg: colors.textSecondary},
});

export const riskTone = risk => (risk === 'Low' ? 'green' : risk === 'Medium' ? 'yellow' : 'red');

export function Badge({label, tone = 'grey', icon, style}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const BADGE_TONES = getBadgeTones(colors);
  const t = BADGE_TONES[tone] || BADGE_TONES.grey;
  return (
    <View style={[styles.badge, {backgroundColor: t.bg}, style]}>
      {icon ? <Ionicons name={icon} size={11} color={t.fg} style={styles.badgeIcon} /> : null}
      <Text style={[styles.badgeText, {color: t.fg}]}>{label}</Text>
    </View>
  );
}

export function InfoRow({label, value, valueColor, bold, icon, style}) {
  const colors = useVaultColors();
  const styles = useStyles();
  return (
    <View style={[styles.infoRow, style]}>
      <View style={styles.infoLabelWrap}>
        {icon ? <Ionicons name={icon} size={14} color={colors.textMuted} style={styles.infoIcon} /> : null}
        <Text style={[styles.infoLabel, bold && styles.infoLabelBold]}>{label}</Text>
      </View>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[styles.infoValue, bold && styles.infoValueBold, valueColor && {color: valueColor}]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

const TOKENS = {
  USDC: {icon: 'currency-usd', bg: '#2775CA'},
  USDT: {icon: 'currency-usd', bg: '#26A17B'},
  ETH: {icon: 'ethereum', bg: '#627EEA'},
  WBTC: {icon: 'bitcoin', bg: '#F7931A'},
  BTC: {icon: 'bitcoin', bg: '#F7931A'},
  SOL: {icon: 'alpha-s', bg: '#9945FF'},
  BNB: {icon: 'alpha-b', bg: '#E8AE18'},
};

const SWIFTEX_LOGO = require('../../../assets/darkBlue.png');

// Pass the vault `name`: SwiftEx's own vaults show the SwiftEx logo instead of the token icon.
export function TokenIcon({symbol, name, size = 36, style}) {
  const colors = useVaultColors();
  const styles = useStyles();
  if (typeof name === 'string' && /swiftex/i.test(name)) {
    return (
      <Image
        source={SWIFTEX_LOGO}
        resizeMode="cover"
        style={[{width: size, height: size, borderRadius: size / 2}, style]}
      />
    );
  }
  const t = TOKENS[symbol] || {icon: 'circle-multiple-outline', bg: colors.elevated};
  return (
    <View style={[{width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg}, styles.center, style]}>
      <MaterialCommunityIcons name={t.icon} size={size * 0.58} color="#FFFFFF" />
    </View>
  );
}

export function IconCircle({name, color, bg, size = 56, iconSize, family = 'ion', style}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const Icon = family === 'mci' ? MaterialCommunityIcons : Ionicons;
  return (
    <View
      style={[
        {width: size, height: size, borderRadius: size / 2, backgroundColor: bg || colors.primarySoft},
        styles.center,
        style,
      ]}>
      <Icon name={name} size={iconSize || size * 0.46} color={color || colors.primary} />
    </View>
  );
}

export function Skeleton({width = '100%', height = 14, r = 6, style}) {
  const colors = useVaultColors();
  const o = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(o, {toValue: 1, duration: 700, useNativeDriver: true}),
        Animated.timing(o, {toValue: 0.4, duration: 700, useNativeDriver: true}),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [o]);
  return <Animated.View style={[{width, height, borderRadius: r, backgroundColor: colors.elevated, opacity: o}, style]} />;
}

export function SkeletonRows({count = 3}) {
  const styles = useStyles();
  return Array.from({length: count}).map((_, i) => (
    <Card key={i} style={styles.skeletonRow}>
      <Skeleton width={36} height={36} r={18} />
      <View style={styles.flexPad}>
        <Skeleton width="55%" height={12} />
        <Skeleton width="35%" height={10} style={styles.mt8} />
      </View>
      <Skeleton width={54} height={22} r={6} />
    </Card>
  ));
}

export function Spinner({size = 72, color: colorProp, track: trackProp, thickness = 4}) {
  const colors = useVaultColors();
  const color = colorProp || colors.success;
  const track = trackProp || colors.successSoft;
  const r = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(r, {toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true}),
    );
    a.start();
    return () => a.stop();
  }, [r]);
  const rotate = r.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']});
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: thickness,
        borderColor: track,
        borderTopColor: color,
        borderRightColor: color,
        transform: [{rotate}],
      }}
    />
  );
}

export const useStyles = makeStyles(colors => ({
  safe: {flex: 1, backgroundColor: colors.bg},
  flex: {flex: 1},
  flexPad: {flex: 1, marginHorizontal: spacing.md},
  mt8: {marginTop: 8},
  center: {alignItems: 'center', justifyContent: 'center'},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl},
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg,
  },

  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  headerSide: {width: 48, justifyContent: 'center'},
  headerRight: {alignItems: 'flex-end'},
  headerTitle: {flex: 1, textAlign: 'center', color: colors.text, fontSize: font.lg, fontWeight: '600'},
  iconBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  divider: {height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md},

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {color: colors.text, fontSize: font.md, fontWeight: '600'},
  sectionAction: {color: colors.accentText, fontSize: font.sm, fontWeight: '500'},

  btn: {borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  btnIcon: {marginRight: 8},
  btnText: {fontWeight: '600'},

  tabs: {flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border},
  tab: {marginRight: spacing.xl, paddingTop: spacing.sm},
  tabText: {color: colors.textMuted, fontSize: font.md, fontWeight: '500', paddingBottom: spacing.sm},
  tabTextActive: {color: colors.text},
  tabLine: {height: 2, borderRadius: 1, backgroundColor: 'transparent'},
  tabLineActive: {backgroundColor: colors.primary},

  chipGroup: {flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 3},
  chip: {flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center'},
  chipActive: {backgroundColor: colors.primary},
  chipText: {color: colors.textSecondary, fontSize: font.sm, fontWeight: '500'},
  chipTextActive: {color: colors.onPrimary},

  badge: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6},
  badgeIcon: {marginRight: 3},
  badgeText: {fontSize: font.xs, fontWeight: '600'},

  infoRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7},
  infoLabelWrap: {flexDirection: 'row', alignItems: 'center', flexShrink: 1},
  infoIcon: {marginRight: 6},
  infoLabel: {color: colors.textSecondary, fontSize: font.sm},
  infoLabelBold: {color: colors.text, fontWeight: '600', fontSize: font.md},
  infoValue: {color: colors.text, fontSize: font.sm, fontWeight: '500', textAlign: 'right'},
  infoValueBold: {fontSize: font.md, fontWeight: '700'},

  skeletonRow: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm},
}));
