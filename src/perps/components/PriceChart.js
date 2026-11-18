import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Line } from "react-native-svg";
import { formatPrice } from "../utils/format";

// Simple line/area chart of candle closes.
const PriceChart = ({ candles, width, height, color, theme, tickSize }) => {
  const geometry = useMemo(() => {
    if (!candles || candles.length < 2 || !width) return null;
    const closes = candles.map((c) => c.c);
    const highs = candles.map((c) => c.h);
    const lows = candles.map((c) => c.l);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const range = max - min || 1;
    const padTop = 8;
    const padBottom = 8;
    const usable = height - padTop - padBottom;
    const stepX = width / (closes.length - 1);
    const y = (v) => padTop + (1 - (v - min) / range) * usable;
    let line = "";
    closes.forEach((v, i) => {
      line += `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)},${y(v).toFixed(2)} `;
    });
    const area = `${line}L${width.toFixed(2)},${height} L0,${height} Z`;
    const lastY = y(closes[closes.length - 1]);
    return { line, area, max, min, lastY };
  }, [candles, width, height]);

  if (!geometry) return <View style={{ width, height }} />;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="perpsArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={geometry.area} fill="url(#perpsArea)" />
        <Path d={geometry.line} stroke={color} strokeWidth={2} fill="none" />
        <Line
          x1="0"
          x2={width}
          y1={geometry.lastY}
          y2={geometry.lastY}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4,4"
          opacity={0.6}
        />
      </Svg>
      <Text style={[styles.label, styles.top, { color: theme.inactiveTx }]}>
        {formatPrice(geometry.max, tickSize)}
      </Text>
      <Text style={[styles.label, styles.bottom, { color: theme.inactiveTx }]}>
        {formatPrice(geometry.min, tickSize)}
      </Text>
    </View>
  );
};

export default React.memo(PriceChart);

const styles = StyleSheet.create({
  label: {
    position: "absolute",
    right: 4,
    fontSize: 11,
  },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
