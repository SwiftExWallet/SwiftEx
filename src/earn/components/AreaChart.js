import React, {useMemo, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useVaultColors, makeStyles, font} from '../theme';
import {hexToRgba} from '../utils';

export default function AreaChart({
  data,
  height = 140,
  color: colorProp,
  fillOpacity = 0.14,
  xLabels,
  yLabels,
  barWidth = 2,
  grid = true,
  style,
}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const color = colorProp || colors.primary;
  const [w, setW] = useState(0);

  const cols = useMemo(() => {
    if (!w || !data || data.length < 2) return [];
    const n = Math.max(2, Math.floor(w / barWidth));
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (data.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(data.length - 1, lo + 1);
      const v = data[lo] + (data[hi] - data[lo]) * (t - lo);
      out.push(range > 0 ? 0.1 + 0.8 * ((v - min) / range) : 0.5);
    }
    return out;
  }, [w, data, barWidth]);

  const fill = hexToRgba(color, fillOpacity);
  const last = cols.length ? cols[cols.length - 1] : 0;

  return (
    <View style={style}>
      <View style={styles.row}>
        {yLabels ? (
          <View style={[styles.yCol, {height}]}>
            {yLabels.map((l, i) => (
              <Text key={`${i}-${l}`} style={styles.axis}>
                {l}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={[styles.plot, {height}]} onLayout={e => setW(e.nativeEvent.layout.width)}>
          {grid
            ? [0.25, 0.5, 0.75].map(g => <View key={g} style={[styles.grid, {top: height * g}]} />)
            : null}
          <View style={styles.cols}>
            {cols.map((c, i) => {
              const prev = i > 0 ? cols[i - 1] : c;
              const next = i < cols.length - 1 ? cols[i + 1] : c;
              const line = 2 + Math.max(0, c - Math.min(prev, next)) * height;
              return (
                <View key={i} style={{width: barWidth, height: c * height, backgroundColor: fill}}>
                  <View style={{height: Math.min(line, c * height), backgroundColor: color}} />
                </View>
              );
            })}
          </View>
          {cols.length ? (
            <View style={[styles.dotWrap, {bottom: last * height - 6}]}>
              <View style={[styles.dotHalo, {backgroundColor: hexToRgba(color, 0.25)}]} />
              <View style={[styles.dot, {backgroundColor: color}]} />
            </View>
          ) : null}
        </View>
      </View>
      {xLabels ? (
        <View style={[styles.xRow, yLabels && styles.xRowOffset]}>
          {xLabels.map((l, i) => (
            <Text key={`${i}-${l}`} style={styles.axis}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  row: {flexDirection: 'row'},
  plot: {flex: 1, overflow: 'visible'},
  yCol: {justifyContent: 'space-between', marginRight: 6, width: 34},
  grid: {position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border},
  cols: {position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end'},
  dotWrap: {position: 'absolute', right: -6, width: 12, height: 12, alignItems: 'center', justifyContent: 'center'},
  dotHalo: {position: 'absolute', width: 12, height: 12, borderRadius: 6},
  dot: {width: 6, height: 6, borderRadius: 3},
  xRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 8},
  xRowOffset: {marginLeft: 40},
  axis: {color: colors.textMuted, fontSize: font.xs - 1},
}));
