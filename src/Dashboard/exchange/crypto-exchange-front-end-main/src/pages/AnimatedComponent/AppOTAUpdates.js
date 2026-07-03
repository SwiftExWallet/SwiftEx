import React, { useEffect, useState, useRef } from "react";
import {
  Modal,
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import { useStallionUpdate, restart } from "react-native-stallion";

const AppOTAUpdates = () => {
  const { isRestartRequired, newReleaseBundle } = useStallionUpdate();
  const [modalVisible, setModalVisible] = useState(false);
  const isMandatory = !!newReleaseBundle?.isMandatory;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRestartRequired) {
      setModalVisible(true);
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isRestartRequired]);

  const handleRestart = () => {
    setModalVisible(false);
    restart();
  };

  const handleLater = () => {
    Animated.timing(opacityAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setModalVisible(false));
  };

  return (
    <Modal
      transparent
      visible={modalVisible}
      animationType="none"
      onRequestClose={() => {
        if (!isMandatory) handleLater();
      }}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View
            style={[
              styles.iconWrapper,
              isMandatory && { backgroundColor: "#E63946" },
            ]}
          >
            <Text style={styles.iconText}>{"!"}</Text>
          </View>

          {isMandatory && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>REQUIRED UPDATE</Text>
            </View>
          )}

          <Text style={styles.title}>
            {isMandatory ? "Update Required" : "Update Ready"}
          </Text>

          <Text style={styles.description}>
            {isMandatory
              ? "This update includes important fixes and must be installed to continue using the app."
              : newReleaseBundle?.releaseNote ||
                "A new version of the app has been downloaded. Restart now to apply the latest changes and improvements."}
          </Text>

          <View style={styles.buttonRow}>
            {!isMandatory && (
              <TouchableOpacity
                style={styles.laterButton}
                onPress={handleLater}
              >
                <Text style={styles.laterText}>Later</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.restartButton,
                isMandatory && { flex: 1, backgroundColor: "#E63946" },
              ]}
              onPress={handleRestart}
              activeOpacity={0.85}
            >
              <Text style={styles.restartText}>
                {isMandatory ? "Update Now" : "Restart Now"}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 15, 20, 0.55)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  card: {
    width: "100%",
    backgroundColor: "black",
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius:28
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#4052D6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  iconText: {
    fontSize: 26,
    color: "#ffffff",
    fontWeight: "700",
  },
  badge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  badgeText: {
    color: "#E63946",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    color: "gray",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
  },
  laterButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "gray",
    alignItems: "center",
  },
  laterText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  restartButton: {
    flex: 1.4,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#4052D6",
    alignItems: "center",
    shadowColor: "#4052D6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  restartText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
});

export default AppOTAUpdates;