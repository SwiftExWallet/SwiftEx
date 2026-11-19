import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useVaultColors, makeStyles, spacing, font, radius} from '../theme';
import {account} from '../mockData';

export default function AccountBar({onBack, onBell}) {
  const colors = useVaultColors();
  const styles = useStyles();
  return (
    <View style={styles.bar}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.back} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{account.name[0]}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.name}>{account.name}</Text>
        <View style={styles.inline}>
          <View style={styles.online} />
          <Text style={styles.uid}>{account.uid}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.selector} activeOpacity={0.8}>
        <Ionicons name="swap-horizontal" size={13} color={colors.textSecondary} />
        <Text style={styles.selectorText}>Spot</Text>
        <Ionicons name="chevron-down" size={13} color={colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.bell} onPress={onBell}>
        <Ionicons name="notifications-outline" size={18} color={colors.text} />
        <View style={styles.badgeDot} />
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  bar: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md},
  back: {marginRight: spacing.sm},
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {color: colors.accentText, fontWeight: '700'},
  flex: {flex: 1, marginLeft: spacing.sm},
  name: {color: colors.text, fontSize: font.sm, fontWeight: '600'},
  inline: {flexDirection: 'row', alignItems: 'center', marginTop: 1},
  online: {width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success, marginRight: 4},
  uid: {color: colors.textMuted, fontSize: font.xs - 1},
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  selectorText: {color: colors.text, fontSize: font.xs, marginHorizontal: 4},
  bell: {marginLeft: spacing.md, width: 32, height: 32, alignItems: 'center', justifyContent: 'center'},
  badgeDot: {position: 'absolute', top: 6, right: 7, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger},
}));
