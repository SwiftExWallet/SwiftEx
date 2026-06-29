import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

let internalShowFunc;
let internalHideFunc;

// --- OLD WAY LOADER COMPONENTS (UNTOUCHED) ---
const LoadingBar = ({ color }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    ).start();
  }, []);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const opacity = anim.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
  return (
    <View style={loadingStyles.track}>
      <Animated.View style={[loadingStyles.bar, { backgroundColor: color, width, opacity }]} />
    </View>
  );
};

const SpinningDots = ({ color }) => {
  const dots = [0, 1, 2];
  const anims = dots.map(() => useRef(new Animated.Value(0)).current);
  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.delay((dots.length - i - 1) * 160),
        ])
      )
    );
    Animated.parallel(animations).start();
  }, []);
  return (
    <View style={loadingStyles.dotsRow}>
      {anims.map((anim, i) => {
        const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
        const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
        return (
          <Animated.View key={i} style={[loadingStyles.dot, { backgroundColor: color, transform: [{ scale }], opacity }]} />
        );
      })}
    </View>
  );
};

// --- MAIN COMPONENT ---
const CustomInfoProvider = () => {
  const [visible, setVisible] = useState(false);
  const [type, setType] = useState("info");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [buttons, setButtons] = useState([]);
  const [currentTheme, setCurrentTheme] = useState(true);

  // Core Orchestration Animators
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const successFade = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0.3)).current;
  const contentSlideUp = useRef(new Animated.Value(80)).current;
  
  // Advanced Math Loop Vectors
  const masterLoop = useRef(new Animated.Value(0)).current;
  const pulseLoop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (type === "success") {
        successFade.setValue(0);
        badgeScale.setValue(0.3);
        contentSlideUp.setValue(80);
        masterLoop.setValue(0);
        pulseLoop.setValue(0);

        // Entrance Orchestration
        Animated.parallel([
          Animated.timing(successFade, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
          }),
          Animated.spring(badgeScale, {
            toValue: 1,
            friction: 4,
            tension: 45,
            useNativeDriver: true,
          }),
          Animated.timing(contentSlideUp, {
            toValue: 0,
            duration: 650,
            easing: Easing.out(Easing.bezier(0.16, 1, 0.3, 1)),
            useNativeDriver: true,
          }),
        ]).start();

        // High Fidelity Fluid Particles Master Engine
        Animated.loop(
          Animated.timing(masterLoop, {
            toValue: 1,
            duration: 6000,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ).start();

        // Subtle Ambient Breathing Glow Loop
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseLoop, {
              toValue: 1,
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseLoop, {
              toValue: 0,
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        ).start();
      } else {
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }).start();
      }
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible, type]);

  internalShowFunc = (type, title, message, buttons) => {
    setType(type || "info");
    setTitle(title || "Information");
    let finalButtons = [];
    if (!buttons || buttons.length === 0) {
      if (type !== "waiting") {
        finalButtons = [{ text: type === "success" ? "Got it" : "OK", style: "primary", onPress: () => setVisible(false) }];
      }
    } else {
      finalButtons = buttons;
    }
    if (typeof message === "string") { setMessage(message); }
    else if (Array.isArray(message)) { finalButtons = message; setMessage(""); }
    else { setMessage(""); }
    setButtons(finalButtons);
    setVisible(true);
  };

  internalHideFunc = () => setVisible(false);
  const onClose = () => { if (type === "waiting") return; setVisible(false); };
  const btns = buttons.slice(0, 3);

  const colors = {
    light: {
      cardBg: "#ffffff", textPrimary: "#1f2937", textSecondary: "#6b7280",
      backdrop: "rgba(0,0,0,0.5)", defaultBtn: "#f3f4f6", defaultBtnText: "#374151",
      primaryBtn: "#3b82f6", primaryBtnText: "#ffffff", dangerBtn: "#ef4444",
      dangerBtnText: "#ffffff", border: "#e5e7eb", successBg: "#0c0d0f",
    },
    dark: {
      cardBg: "black", textPrimary: "#f9fafb", textSecondary: "#9ca3af",
      backdrop: "rgba(0,0,0,0.7)", defaultBtn: "#1f2937", defaultBtnText: "#d1d5db",
      primaryBtn: "#3b82f6", primaryBtnText: "#ffffff", dangerBtn: "#ef4444",
      dangerBtnText: "#ffffff", border: "#374151", successBg: "#0c0d0f",
    },
  };

  const theme = currentTheme ? colors.dark : colors.light;
  const iconConfig = {
    info: { name: "information-circle", color: "#3b82f6", bg: "#dbeafe" },
    warning: { name: "warning", color: "#f59e0b", bg: "#fed7aa" },
    error: { name: "close-circle", color: "#ef4444", bg: "#fee2e2" },
    waiting: { name: "time-outline", color: "#3b82f6", bg: "#ede9fe" },
  };
  const icon = iconConfig[type] || iconConfig.info;

  const getButtonStyle = (btn) => {
    if (btn.style === "destructive") return { backgroundColor: theme.dangerBtn, textColor: theme.dangerBtnText };
    if (btn.style === "primary" || btns.length === 1) return { backgroundColor: theme.primaryBtn, textColor: theme.primaryBtnText };
    return { backgroundColor: theme.defaultBtn, textColor: theme.defaultBtnText };
  };

  // --- MATHEMATICAL INTERPOLATIONS MATRIX FOR TRUE INTERACTIVE DYNAMICS ---
  
  // Staggered spin mappings
  const spinDegree = masterLoop.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const reverseSpinDegree = masterLoop.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] });

  // Concentric radar shockwaves scale & dynamic transparency
  const rScale1 = masterLoop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 2.2, 2.6] });
  const rOpacity1 = masterLoop.interpolate({ inputRange: [0, 0.4, 0.8, 1], outputRange: [0.35, 0.25, 0.05, 0] });
  
  const rScale2 = masterLoop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.8, 1.8, 2.1] });
  const rOpacity2 = masterLoop.interpolate({ inputRange: [0, 0.5, 0.85, 1], outputRange: [0.25, 0.18, 0.03, 0] });

  // Ambient Core Breathing glow transforms
  const ambientGlow = pulseLoop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ambientOpacity = pulseLoop.interpolate({ inputRange: [0, 1], outputRange: [0.03, 0.08] });

  // Physics-based orbital math paths for confetti shapes
  const orbitTranslateX1 = masterLoop.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 65, 0, -65, 0] });
  const orbitTranslateY1 = masterLoop.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [-65, 0, 65, 0, -65] });

  const orbitTranslateX2 = masterLoop.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [-80, 0, 80, 0, -80] });
  const orbitTranslateY2 = masterLoop.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -45, 0, 45, 0] });

  const orbitTranslateX3 = masterLoop.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [50, -50, 50, -50, 50] });
  const orbitTranslateY3 = masterLoop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-75, 75, -75] });

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      {type === "success" ? (
        // ================= HIGH INTERACTIVE CINEMATIC SUCCESS UI =================
        <Animated.View style={[styles.successFullContainer, { backgroundColor: theme.successBg, opacity: successFade }]}>
          
          {/* Ambient Soft Glow Backdrop */}
          <Animated.View style={[styles.glowingHaloBackground, { transform: [{ scale: ambientGlow }], opacity: ambientOpacity }]} />

          {/* Staggered Dynamic Radar Waves */}
          <View style={styles.rippleAbsoluteCenter}>
            <Animated.View style={[styles.radarRing, { transform: [{ scale: rScale1 }, { rotate: spinDegree }], opacity: rOpacity1 }]} />
            <Animated.View style={[styles.radarRing, { transform: [{ scale: rScale2 }, { rotate: reverseSpinDegree }], opacity: rOpacity2 }]} />
            <View style={[styles.radarRing, { transform: [{ scale: 1.4 }], opacity: 0.02, borderStyle: "solid" }]} />
          </View>

          {/* Core Asset Container & Orbital Energy Grid */}
          <View style={styles.imageIconWrapper}>
            
            {/* Real Orbital Trajectory Particles */}
            <Animated.View style={[styles.confettiDot, { backgroundColor: "#fef08a", transform: [{ translateX: orbitTranslateX1 }, { translateY: orbitTranslateY1 }] }]} />
            <Animated.View style={[styles.confettiRing, { borderColor: "#60a5fa", transform: [{ translateX: orbitTranslateX2 }, { translateY: orbitTranslateY2 }] }]} />
            <Animated.View style={[styles.confettiStar, { backgroundColor: "#fb923c", transform: [{ translateX: orbitTranslateX3 }, { translateY: orbitTranslateY3 }, { rotate: spinDegree }] }]} />
            <Animated.View style={[styles.confettiSquare, { backgroundColor: "#c084fc", transform: [{ translateX: orbitTranslateY1 }, { translateY: orbitTranslateX2 }, { rotate: reverseSpinDegree }] }]} />
            <Animated.View style={[styles.confettiWave, { backgroundColor: "#22d3ee", transform: [{ translateX: orbitTranslateY3 }, { translateY: orbitTranslateX1 }] }]} />
            <Animated.View style={[styles.confettiTriangle, { borderBottomColor: "#4ade80", transform: [{ translateX: orbitTranslateX2 }, { translateY: orbitTranslateY1 }] }]} />

            {/* Premium Interactive Core Checkmark Badge */}
            <Animated.View style={[styles.badgeOuterRing, { transform: [{ scale: badgeScale }] }]}>
              <View style={styles.badgeInnerContainer}>
                <Ionicons name="checkmark" size={44} color="#4ade80" />
              </View>
            </Animated.View>
          </View>

          {/* Cinematic Elastic Sliding Typography */}
          <Animated.View style={[styles.animatedContentText, { transform: [{ translateY: contentSlideUp }] }]}>
            <Text style={styles.successTitleText}>{title}</Text>
            {!!message && <Text style={styles.successMessageText}>{message}</Text>}
          </Animated.View>

          {/* Fixed Premium Action Controller */}
          <Animated.View style={[styles.bottomBtnWrapper, { transform: [{ translateY: contentSlideUp }] }]}>
            {btns.map((btn, i) => (
              <TouchableOpacity key={i} style={styles.imageStyleButton} onPress={() => { btn.onPress?.(); onClose(); }} activeOpacity={0.92}>
                <Text style={styles.imageStyleButtonText}>{btn.text}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </Animated.View>
      ) : (
        // ================= STANDARD UNTOUCHED STATES (OLD WAY) =================
        <View style={[styles.backdrop, { backgroundColor: theme.backdrop }]}>
          <Animated.View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border, transform: [{ scale: scaleAnim }] }]}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme ? `${icon.color}20` : icon.bg }]}>
              <Ionicons name={icon.name} size={32} color={icon.color} />
            </View>

            <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
            {!!message && <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>}

            {type === "waiting" && (
              <View style={styles.waitingContainer}>
                <LoadingBar color={icon.color} />
                <SpinningDots color={icon.color} />
              </View>
            )}

            {btns.length > 0 && (
              <View style={[styles.btnContainer, btns.length > 2 && styles.btnContainerVertical]}>
                {btns.map((btn, i) => {
                  const btnStyle = getButtonStyle(btn);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.button,
                        btns.length > 2 && styles.buttonVertical,
                        { backgroundColor: btnStyle.backgroundColor },
                        btn.style === "cancel" && styles.buttonOutline,
                        btn.style === "cancel" && { backgroundColor: "transparent", borderColor: theme.border },
                      ]}
                      onPress={() => { btn.onPress?.(); onClose(); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.btnText, { color: btnStyle.textColor }, btn.style === "cancel" && { color: theme.textSecondary }]}>
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Animated.View>
        </View>
      )}
    </Modal>
  );
};

CustomInfoProvider.show = (type, title, message, buttons) => {
  if (typeof message === "string" && message.includes("[big.js] ")) message = "Invalid value";
  if (typeof title === "string" && title.includes("[big.js] ")) title = "Invalid value";
  internalShowFunc(type, title, message, buttons);
};

CustomInfoProvider.hide = () => internalHideFunc?.();

export default CustomInfoProvider;

const styles = StyleSheet.create({
  // --- OLD UNTOUCHED STYLES ---
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  card: { width: "100%", maxWidth: 400, borderRadius: 24, padding: 24, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 15 },
  iconContainer: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 8, letterSpacing: 0.3 },
  message: { fontSize: 15, textAlign: "center", marginBottom: 24, lineHeight: 22 },
  waitingContainer: { marginTop: 4, marginBottom: 8, gap: 12 },
  btnContainer: { flexDirection: "row", gap: 12, marginTop: 8 },
  btnContainerVertical: { flexDirection: "column-reverse" },
  button: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", minHeight: 48 },
  buttonVertical: { flex: 0, width: "100%" },
  buttonOutline: { borderWidth: 1.5 },
  btnText: { fontWeight: "600", fontSize: 16, letterSpacing: 0.2 },

  // --- HIGH FIDELITY INTERACTIVE SUCCESS STYLES ---
  successFullContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  glowingHaloBackground: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#10b981",
    filter: "blur(40px)", // Native blur simulation fallback via absolute layouts
  },
  rippleAbsoluteCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 0,
    marginTop: -160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRing: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: "rgba(74, 222, 128, 0.35)",
    borderStyle: "dashed",
  },
  imageIconWrapper: { position: "relative", justifyContent: "center", alignItems: "center", marginBottom: 40, width: 180, height: 180, zIndex: 1 },
  badgeOuterRing: { width: 136, height: 136, borderRadius: 68, backgroundColor: "rgba(74, 222, 128, 0.05)", justifyContent: "center", alignItems: "center" },
  badgeInnerContainer: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: "#4ade80", justifyContent: "center", alignItems: "center", backgroundColor: "#121316", shadowColor: "#4ade80", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 15, elevation: 10 },
  animatedContentText: { width: "100%", alignItems: "center", zIndex: 1 },
  successTitleText: { fontSize: 26, fontWeight: "700", color: "#ffffff", textAlign: "center", marginBottom: 12, letterSpacing: 0.2 },
  successMessageText: { fontSize: 15, color: "#94a3b8", textAlign: "center", paddingHorizontal: 24, lineHeight: 22 },
  bottomBtnWrapper: { position: "absolute", bottom: 45, width: "100%", paddingHorizontal: 4 },
  imageStyleButton: { width: "100%", backgroundColor: "#ffffff", paddingVertical: 16, borderRadius: 30, alignItems: "center", justifyContent: "center", shadowColor: "#ffffff", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  imageStyleButtonText: { color: "#000000", fontSize: 16, fontWeight: "600" },
  
  // Real Vector Coordinates Positions for Engine
  confettiDot: { position: "absolute", width: 7, height: 7, borderRadius: 3.5 },
  confettiRing: { position: "absolute", width: 9, height: 9, borderRadius: 4.5, borderWidth: 2 },
  confettiStar: { position: "absolute", width: 8, height: 8, transform: [{ rotate: "45deg" }] },
  confettiWave: { position: "absolute", width: 12, height: 3.5, borderRadius: 2 },
  confettiSquare: { position: "absolute", width: 8, height: 8 },
  confettiTriangle: { position: "absolute", width: 0, height: 0, borderLeftWidth: 5, borderLeftColor: "transparent", borderRightWidth: 5, borderRightColor: "transparent", borderBottomWidth: 10 },
});

const loadingStyles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: "#a78bfa22", overflow: "hidden", width: "100%" },
  bar: { height: "100%", borderRadius: 3 },
  dotsRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});