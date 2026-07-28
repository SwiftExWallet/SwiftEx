import { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ACCENT = '#6C5CE7';
const ACCENT_SOFT = '#F1EEFE';
const SUCCESS = '#00B894';

const ReferralBottomSheet = ({ visible, referralCode, onClose }) => {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.9)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;
  const badgeRotate = useRef(new Animated.Value(0)).current;
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const dragY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 6 && gesture.dy > 0,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) dragY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 0.8) {
          closeWithAnimation();
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            friction: 7,
            tension: 60,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const closeWithAnimation = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dragY.setValue(0);
      contentScale.setValue(0.9);
      badgeScale.setValue(0);
      onClose && onClose();
    });
  };

  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      contentScale.setValue(0.9);
      badgeScale.setValue(0);
      badgeRotate.setValue(0);
      sparkle1.setValue(0);
      sparkle2.setValue(0);

      Animated.sequence([
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            friction: 9,
            tension: 70,
            useNativeDriver: true,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.spring(contentScale, {
            toValue: 1,
            friction: 8,
            tension: 80,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.spring(badgeScale, {
            toValue: 1,
            friction: 5,
            tension: 140,
            useNativeDriver: true,
          }),
          Animated.timing(badgeRotate, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(sparkle1, {
              toValue: 1,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(sparkle1, {
              toValue: 0,
              duration: 900,
              useNativeDriver: true,
            }),
          ])
        ).start();
        Animated.loop(
          Animated.sequence([
            Animated.timing(sparkle2, {
              toValue: 1,
              duration: 1100,
              useNativeDriver: true,
            }),
            Animated.timing(sparkle2, {
              toValue: 0,
              duration: 1100,
              useNativeDriver: true,
            }),
          ])
        ).start();
      });
    }
  }, [visible]);

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.96,
      friction: 6,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      friction: 5,
      useNativeDriver: true,
    }).start();
  };

  const badgeSpin = badgeRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-30deg', '0deg'],
  });

  const sparkle1Style = {
    opacity: sparkle1,
    transform: [
      { scale: sparkle1.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.1] }) },
    ],
  };
  const sparkle2Style = {
    opacity: sparkle2,
    transform: [
      { scale: sparkle2.interpolate({ inputRange: [0, 1], outputRange: [1.1, 0.6] }) },
    ],
  };

  const sheetTranslate = Animated.add(translateY, dragY);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeWithAnimation}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={closeWithAnimation}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY: sheetTranslate }, { scale: contentScale }],
          },
        ]}
      >
        <View {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        <View style={styles.badgeWrap}>
          <Animated.View style={[styles.sparkle, styles.sparkleTopLeft, sparkle1Style]}>
            <Text style={styles.sparkleText}>✦</Text>
          </Animated.View>
          <Animated.View style={[styles.sparkle, styles.sparkleBottomRight, sparkle2Style]}>
            <Text style={styles.sparkleText}>✦</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.badge,
              {
                transform: [{ scale: badgeScale }, { rotate: badgeSpin }],
              },
            ]}
          >
            <Text style={styles.badgeCheck}>✓</Text>
          </Animated.View>
        </View>

        <Text style={styles.title}>Referral Applied!</Text>
        <Text style={styles.subtitle}>
          We found a referral code and applied it to your account automatically.
        </Text>

        <View style={styles.codeCard}>
          <View style={styles.codeCardLeft}>
            <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
            <Text style={styles.codeValue}>{referralCode || '—'}</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Active on this device</Text>
        </View>

        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={closeWithAnimation}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>Got it</Text>
          </TouchableOpacity>
        </Animated.View>

      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,20,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e2e6',
    marginBottom: 8,
    marginTop: 4,
  },
  badgeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 96,
    marginTop: 8,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: SUCCESS,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SUCCESS,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  badgeCheck: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '700',
  },
  sparkle: {
    position: 'absolute',
  },
  sparkleTopLeft: {
    top: 4,
    left: '28%',
  },
  sparkleBottomRight: {
    bottom: 6,
    right: '26%',
  },
  sparkleText: {
    fontSize: 16,
    color: ACCENT,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#16161a',
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#7a7a85',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ACCENT_SOFT,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  codeCardLeft: {
    flexShrink: 1,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: 0.5,
  },
  copyButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#dcd6fb',
  },
  copyButtonActive: {
    backgroundColor: SUCCESS,
    borderColor: SUCCESS,
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: ACCENT,
  },
  copyButtonTextActive: {
    color: '#fff',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: SUCCESS,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#8b8b93',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#16161a',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#16161a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 50
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  shareLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  shareLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT,
  },
});

export default ReferralBottomSheet;