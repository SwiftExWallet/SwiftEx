import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Skeleton} from './ui';
import {useVaultColors, makeStyles, radius, spacing, font} from '../theme';
import {usd, pct} from '../utils';

export default function BalanceCard({label = 'Your Total Balance', amount, change, changePct, period = '24h', loading, style}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const [hidden, setHidden] = useState(false);

  if (loading) {
    return (
      <View style={[styles.card, style]}>
        <Skeleton width={110} height={12} />
        <Skeleton width={170} height={28} style={styles.mt12} />
        <Skeleton width={130} height={12} style={styles.mt12} />
      </View>
    );
  }

  const up = change >= 0;
  return (
    <View style={[styles.card, style]}>
      <View style={styles.glow} />
      <View style={styles.glow2} />
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity onPress={() => setHidden(h => !h)} style={styles.eye} activeOpacity={0.7}>
          <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={15} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.amount}>{hidden ? '••••••' : usd(amount)}</Text>
      <Text style={[styles.change, {color: up ? colors.success : colors.danger}]}>
        {hidden ? '••••' : `${up ? '+' : '-'}${usd(Math.abs(change))}  ${pct(changePct)}`}
        <Text style={styles.period}>{`  (${period})`}</Text>
      </Text>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  card: {
    backgroundColor: colors.cardNavy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlay,
  },
  glow: {
    position: 'absolute',
    right: -50,
    top: -70,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.cardNavyGlow,
    opacity: 0.55,
  },
  glow2: {
    position: 'absolute',
    right: 30,
    bottom: -90,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.cardNavyGlow,
    opacity: 0.25,
  },
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  label: {color: colors.textSecondary, fontSize: font.sm},
  eye: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {color: colors.text, fontSize: font.xxl, fontWeight: '700', marginTop: spacing.xs, letterSpacing: -0.5},
  change: {fontSize: font.sm, fontWeight: '600', marginTop: spacing.xs},
  period: {color: colors.textSecondary, fontWeight: '400'},
  mt12: {marginTop: 12},
}));
