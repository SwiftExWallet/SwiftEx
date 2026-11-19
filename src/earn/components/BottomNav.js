import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useVaultColors, makeStyles, useBottomInset, font} from '../theme';

export const NAV_ITEMS = [
  {key: 'home', label: 'Home', icon: 'home'},
  {key: 'markets', label: 'Markets', icon: 'stats-chart'},
  {key: 'earn', label: 'Earn', icon: 'layers'},
  {key: 'portfolio', label: 'Portfolio', icon: 'pie-chart'},
];

export default function BottomNav({active, onChange}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const bottomInset = useBottomInset();
  return (
    <View style={[styles.bar, {paddingBottom: 10 + bottomInset}]}>
      {NAV_ITEMS.map(it => {
        const on = it.key === active;
        return (
          <TouchableOpacity key={it.key} style={styles.item} onPress={() => onChange && onChange(it.key)} activeOpacity={0.7}>
            <Ionicons name={on ? it.icon : `${it.icon}-outline`} size={21} color={on ? colors.primary : colors.textMuted} />
            <Text style={[styles.label, on && styles.labelActive]}>{it.label}</Text>
            {on ? <View style={styles.dot} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 10,
  },
  item: {flex: 1, alignItems: 'center'},
  label: {color: colors.textMuted, fontSize: font.xs - 1, marginTop: 3},
  labelActive: {color: colors.text, fontWeight: '600'},
  dot: {width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 3},
}));
