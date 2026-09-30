import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { getServiceStatusForScreen } from "./AppCheckService";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";

const STATUS_CONFIG = {
  down: {
    icon: "close-circle",
    label: "Unavailable",
    bannerBg: "#1A0A0A",
    borderColor: "#E53935",
    circleBg: "#3B0000",
    iconColor: "#E53935",
    titleColor: "#FF5252",
    msgColor: "#FFCDD2",
  },
  degraded: {
    icon: "alert",
    label: "Degraded",
    bannerBg: "#1A1400",
    borderColor: "#FFA000",
    circleBg: "#3B2800",
    iconColor: "#FFA000",
    titleColor: "#FFB300",
    msgColor: "#FFE082",
  },
  maintenance: {
    icon: "wrench",
    label: "Under Maintenance",
    bannerBg: "#001A2A",
    borderColor: "#1E88E5",
    circleBg: "#002847",
    iconColor: "#1E88E5",
    titleColor: "#42A5F5",
    msgColor: "#BBDEFB",
  },
  overload: {
    icon: "lightning-bolt",
    label: "Overloaded",
    bannerBg: "#1A0D00",
    borderColor: "#FF6D00",
    circleBg: "#3B1A00",
    iconColor: "#FF6D00",
    titleColor: "#FF9100",
    msgColor: "#FFD180",
  },
  high_traffic: {
    icon: "trending-up",
    label: "High Traffic",
    bannerBg: "#1A1000",
    borderColor: "#F9A825",
    circleBg: "#3B2500",
    iconColor: "#F9A825",
    titleColor: "#FBC02D",
    msgColor: "#FFF176",
  },
  partial_outage: {
    icon: "alert-circle",
    label: "Partial Outage",
    bannerBg: "#1A0A0A",
    borderColor: "#E64A19",
    circleBg: "#3B1200",
    iconColor: "#E64A19",
    titleColor: "#FF7043",
    msgColor: "#FFCCBC",
  },
  investigating: {
    icon: "magnify",
    label: "Investigating",
    bannerBg: "#12001A",
    borderColor: "#AB47BC",
    circleBg: "#2A0033",
    iconColor: "#AB47BC",
    titleColor: "#CE93D8",
    msgColor: "#F3E5F5",
  },
  identified: {
    icon: "tools",
    label: "Fix in Progress",
    bannerBg: "#001A12",
    borderColor: "#00897B",
    circleBg: "#002B20",
    iconColor: "#00897B",
    titleColor: "#26A69A",
    msgColor: "#B2DFDB",
  },
  monitoring: {
    icon: "eye",
    label: "Monitoring",
    bannerBg: "#001A0A",
    borderColor: "#43A047",
    circleBg: "#002B10",
    iconColor: "#43A047",
    titleColor: "#66BB6A",
    msgColor: "#C8E6C9",
  },
  unknown: {
    icon: "help-circle",
    label: "Status Unknown",
    bannerBg: "#111111",
    borderColor: "#757575",
    circleBg: "#222222",
    iconColor: "#9E9E9E",
    titleColor: "#BDBDBD",
    msgColor: "#E0E0E0",
  },
};

const GlobalServiceBanner = ({ currentRoute }) => {
  const [service, setService] = useState(null);
  const slideAnim = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    const check = async () => {
      try {
        const res = await AsyncStorage.getItem("AppStatusChecks");
        if (!res) return;
        const appStatus = JSON.parse(res);
        const found = getServiceStatusForScreen(currentRoute, appStatus);
        console.info(found)
        if (found) {
          setService(found);
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }).start();
        } else {
          Animated.timing(slideAnim, {
            toValue: -80,
            duration: 200,
            useNativeDriver: true,
          }).start(() => setService(null));
        }
      } catch (e) {}
    };
    check();
  }, [currentRoute]);

  if (!service) return null;

  const cfg = STATUS_CONFIG[service.status] || STATUS_CONFIG["unknown"];

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: cfg.bannerBg,
          borderLeftColor: cfg.borderColor,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.iconCircle, { backgroundColor: cfg.circleBg }]}>
        <Icon name={cfg.icon} size={20} color={cfg.iconColor} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: cfg.titleColor }]}>
          {service.name} — {cfg.label}
        </Text>
        <Text style={[styles.message, { color: cfg.msgColor }]}>
          {service.message}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: hp(1),
    left: wp(3),
    right: wp(3),
    zIndex: 9999,
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingVertical: hp(1.3),
    paddingHorizontal: wp(3.5),
    flexDirection: "row",
    alignItems: "center",
    elevation: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: wp(3),
  },
  textContainer: { flex: 1 },
  title: { fontWeight: "700", fontSize: 13, marginBottom: 2 },
  message: { fontSize: 12, lineHeight: 17 },
});
export default GlobalServiceBanner;