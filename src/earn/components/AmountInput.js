import React, {useRef, useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, PanResponder} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Card} from './ui';
import {useVaultColors, makeStyles, radius, spacing, font} from '../theme';
import {fmt} from '../utils';

const MARKS = [0, 25, 50, 75, 100];

export function PercentSlider({value, onChange}) {
  const styles = useStyles();
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const startX = useRef(0);
  const cb = useRef(onChange);
  cb.current = onChange;

  const setFromX = x => {
    const W = wRef.current;
    if (!W) return;
    const p = Math.max(0, Math.min(100, (x / W) * 100));
    cb.current(Math.round(p));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => {
        startX.current = e.nativeEvent.locationX;
        setFromX(startX.current);
      },
      onPanResponderMove: (e, g) => setFromX(startX.current + g.dx),
    }),
  ).current;

  const pos = (Math.max(0, Math.min(100, value)) / 100) * w;

  return (
    <View style={styles.sliderWrap}>
      <View
        style={styles.touchArea}
        onLayout={e => {
          wRef.current = e.nativeEvent.layout.width;
          setW(e.nativeEvent.layout.width);
        }}
        {...pan.panHandlers}>
        <View pointerEvents="none" style={styles.track}>
          <View style={[styles.trackFill, {width: pos}]} />
        </View>
        {MARKS.map(m => (
          <View
            key={m}
            pointerEvents="none"
            style={[styles.tick, {left: (m / 100) * w - 4}, value >= m && styles.tickActive]}
          />
        ))}
        <View pointerEvents="none" style={[styles.thumb, {left: pos - 9}]} />
      </View>
      <View style={styles.marks}>
        {MARKS.map(m => (
          <TouchableOpacity key={m} onPress={() => onChange(m)} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
            <Text style={[styles.markText, Math.round(value) === m && styles.markTextActive]}>{m}%</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const trim = n => String(Math.floor(n * 1e6) / 1e6);

export default function AmountInput({value, onChange, max, symbol, label = 'Amount', balanceLabel = 'Balance', error, decimals = 2}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const num = parseFloat(value) || 0;
  const percent = max > 0 ? Math.min(100, (num / max) * 100) : 0;

  const onText = t => {
    let c = t.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const parts = c.split('.');
    if (parts.length > 2) c = parts[0] + '.' + parts.slice(1).join('');
    onChange(c);
  };

  const onPct = p => onChange(p === 0 ? '' : trim((max * p) / 100));

  return (
    <Card>
      <View style={styles.topRow}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.balRow}>
          <Ionicons name="wallet-outline" size={13} color={colors.textMuted} />
          <Text style={styles.balance}>
            {` ${balanceLabel}: `}
            <Text style={styles.balanceValue}>
              {fmt(max, decimals)} {symbol}
            </Text>
          </Text>
        </View>
      </View>

      <View style={[styles.inputBox, error && styles.inputBoxError]}>
        <TextInput
          value={value}
          onChangeText={onText}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          style={styles.input}
          selectionColor={colors.primary}
        />
        <Text style={styles.symbol}>{symbol}</Text>
        <TouchableOpacity onPress={() => onPct(100)} style={styles.maxPill} activeOpacity={0.8}>
          <Text style={styles.maxText}>MAX</Text>
        </TouchableOpacity>
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={13} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <PercentSlider value={percent} onChange={onPct} />
    </Card>
  );
}

const useStyles = makeStyles(colors => ({
  topRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  label: {color: colors.textSecondary, fontSize: font.sm},
  balRow: {flexDirection: 'row', alignItems: 'center'},
  balance: {color: colors.textMuted, fontSize: font.sm},
  balanceValue: {color: colors.text, fontWeight: '500'},

  inputBox: {
    marginTop: spacing.md,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  inputBoxError: {borderColor: colors.danger},
  input: {flex: 1, color: colors.text, fontSize: 22, fontWeight: '600', paddingVertical: 0},
  symbol: {color: colors.textSecondary, fontSize: font.md, marginRight: spacing.sm},
  maxPill: {backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6},
  maxText: {color: colors.accentText, fontSize: font.xs, fontWeight: '700'},
  errorRow: {flexDirection: 'row', alignItems: 'center', marginTop: 6},
  errorText: {color: colors.danger, fontSize: font.xs, marginLeft: 4},

  sliderWrap: {marginTop: spacing.lg},
  touchArea: {height: 28, justifyContent: 'center'},
  track: {height: 4, borderRadius: 2, backgroundColor: colors.elevated, overflow: 'hidden'},
  trackFill: {height: 4, backgroundColor: colors.primary},
  tick: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.elevated,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  tickActive: {backgroundColor: colors.primary},
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.onPrimary,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  marks: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 4},
  markText: {color: colors.textMuted, fontSize: font.xs},
  markTextActive: {color: colors.text, fontWeight: '600'},
}));
