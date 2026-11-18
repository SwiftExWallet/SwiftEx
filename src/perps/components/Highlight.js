import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";

// Soft glow around a row: border fades in, holds, fades out (~1.5s; "light" is shorter + fainter).
// `pulse` changes (e.g. a timestamp) start a new glow; null = no glow.
const Highlight = ({ pulse, strength = "strong", color, radius = 16, style, onLayout, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return undefined;
    const peak = strength === "light" ? 0.55 : 1;
    const hold = strength === "light" ? 250 : 800;
    v.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(v, { toValue: peak, duration: 250, useNativeDriver: false }),
      Animated.delay(hold),
      Animated.timing(v, { toValue: 0, duration: 450, useNativeDriver: false }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [pulse, strength, v]);
  const borderColor = v.interpolate({ inputRange: [0, 1], outputRange: ["rgba(0,0,0,0)", color] });
  return (
    <Animated.View onLayout={onLayout} style={[{ borderWidth: 2, borderRadius: radius + 2, borderColor, marginHorizontal: 10, marginBottom: 4 }, style]}>
      {children}
    </Animated.View>
  );
};

export default Highlight;
