import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

let internalShowFunc;
let internalHideFunc;

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
        Animated.timing(anim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const width = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <View style={loadingStyles.track}>
      <Animated.View
        style={[
          loadingStyles.bar,
          { backgroundColor: color, width, opacity },
        ]}
      />
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
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay((dots.length - i - 1) * 160),
        ])
      )
    );
    Animated.parallel(animations).start();
  }, []);

  return (
    <View style={loadingStyles.dotsRow}>
      {anims.map((anim, i) => {
        const scale = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.6, 1],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.3, 1],
        });
        return (
          <Animated.View
            key={i}
            style={[
              loadingStyles.dot,
              { backgroundColor: color, transform: [{ scale }], opacity },
            ]}
          />
        );
      })}
    </View>
  );
};

const CustomInfoProvider = () => {
  const [visible, setVisible] = useState(false);
  const [type, setType] = useState("info");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [buttons, setButtons] = useState([]);
  const [currentTheme,setCurrentTheme] = useState(true);

  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible]);

  internalShowFunc = (type, title, message, buttons) => {
    setType(type || "info");
    setTitle(title || "Information");
    let finalButtons = [];
    if (!buttons || buttons.length === 0) {
      if (type !== "waiting") {
      finalButtons = [
        {
          text: "OK",
          style: "primary",
          onPress: () => setVisible(false),
        },
      ];
      }
    } else {
      finalButtons = buttons;
    }
  
    if (typeof message === "string") {
      setMessage(message);
    } else if (Array.isArray(message)) {
      finalButtons = message;
      setMessage("");
    } else {
      setMessage("");
    }
  
    setButtons(finalButtons);
    setVisible(true);
  };

  internalHideFunc = () => {
    setVisible(false);
  };

  const onClose = () => {
    if (type === "waiting") return;
    setVisible(false);
  };

  const btns = buttons.slice(0, 3);

  const colors = {
    light: {
      cardBg: "#ffffff",
      textPrimary: "#1f2937",
      textSecondary: "#6b7280",
      backdrop: "rgba(0,0,0,0.5)",
      defaultBtn: "#f3f4f6",
      defaultBtnText: "#374151",
      primaryBtn: "#3b82f6",
      primaryBtnText: "#ffffff",
      dangerBtn: "#ef4444",
      dangerBtnText: "#ffffff",
      border: "#e5e7eb",
    },
    dark: {
      cardBg: "black",
      textPrimary: "#f9fafb",
      textSecondary: "#9ca3af",
      backdrop: "rgba(0,0,0,0.7)",
      defaultBtn: "#1f2937",
      defaultBtnText: "#d1d5db",
      primaryBtn: "#3b82f6",
      primaryBtnText: "#ffffff",
      dangerBtn: "#ef4444",
      dangerBtnText: "#ffffff",
      border: "#374151",
    },
  };

  const theme = currentTheme ? colors.dark : colors.light;

  const iconConfig = {
    info: { name: "information-circle", color: "#3b82f6", bg: "#dbeafe" },
    success: { name: "checkmark-circle", color: "#10b981", bg: "#d1fae5" },
    warning: { name: "warning", color: "#f59e0b", bg: "#fed7aa" },
    error: { name: "close-circle", color: "#ef4444", bg: "#fee2e2" },
    waiting: { name: "time-outline", color: "#3b82f6", bg: "#ede9fe" },
  };

  const icon = iconConfig[type] || iconConfig.info;

  const getButtonStyle = (btn) => {
    if (btn.style === "destructive") {
      return {
        backgroundColor: theme.dangerBtn,
        textColor: theme.dangerBtnText,
      };
    }
    if (btn.style === "primary" || btns.length === 1){
      return {
        backgroundColor: theme.primaryBtn,
        textColor: theme.primaryBtnText,
      };
    }
    return {
      backgroundColor: theme.defaultBtn,
      textColor: theme.defaultBtnText,
    };
  };
  const isWaiting = type === "waiting";

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.backdrop }]}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.cardBg,
              borderColor: theme.border,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: currentTheme ? `${icon.color}20` : icon.bg,
              },
            ]}
          >
            <Ionicons name={icon.name} size={32} color={icon.color} />
          </View>

          <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>

          {!!message && (
            <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
          )}

          {isWaiting && (
            <View style={styles.waitingContainer}>
              <LoadingBar color={icon.color} />
              <SpinningDots color={icon.color} />
            </View>
          )}

          {btns.length > 0 && (
          <View
            style={[
              styles.btnContainer,
              btns.length > 2 && styles.btnContainerVertical,
            ]}
          >
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
                    btn.style === "cancel" && {
backgroundColor: "transparent",
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={() => {
                    btn.onPress?.();
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.btnText,
                      { color: btnStyle.textColor },
                      btn.style === "cancel" && { color: theme.textSecondary },
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        </Animated.View>
      </View>
    </Modal>
  );
};

// Static show method to call alert like Alert.alert:
CustomInfoProvider.show = (type, title, message, buttons) => {
  if (typeof message === "string" && 
    message.includes("[big.js] ")) {
    message = "Invalid value";
  }
  if (typeof title === "string" && 
    title.includes("[big.js] ")) {
    title = "Invalid value";
  }
  internalShowFunc(type, title, message, buttons);
};

CustomInfoProvider.hide = () => {
  internalHideFunc?.();
};

export default CustomInfoProvider;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  waitingContainer: {
    marginTop: 4,
    marginBottom: 8,
    gap: 12,
  },
  btnContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  btnContainerVertical: {
    flexDirection: "column-reverse",
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonVertical: {
    flex: 0,
    width: "100%",
  },
  buttonOutline: {
    borderWidth: 1.5,
  },
  btnText: {
    fontWeight: "600",
    fontSize: 16,
    letterSpacing: 0.2,
  },
});

const loadingStyles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#a78bfa22",
    overflow: "hidden",
    width: "100%",
  },
  bar: {
    height: "100%",
    borderRadius: 3,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});