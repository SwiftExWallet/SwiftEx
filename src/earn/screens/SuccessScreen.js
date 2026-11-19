import React, {useEffect, useRef} from 'react';
import {View, Text, Animated} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Screen, Button} from '../components/ui';
import {useVaultColors, makeStyles, spacing, font} from '../theme';

export default function SuccessScreen({navigation, route}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const p = (route && route.params) || {};
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {toValue: 1, friction: 5, useNativeDriver: true}),
      Animated.timing(opacity, {toValue: 1, duration: 250, useNativeDriver: true}),
    ]).start();
  }, [scale, opacity]);

  const go = (routeName, params) => {
    navigation.navigate('EarnHome');
    if (routeName && routeName !== 'EarnHome') navigation.navigate(routeName, params);
  };

  return (
    <Screen
      scroll={false}
      contentStyle={styles.center}
      footer={
        <>
          {p.primaryLabel ? (
            <Button label={p.primaryLabel} onPress={() => go(p.primaryRoute, p.primaryParams)} />
          ) : null}
          {p.secondaryLabel ? (
            <Button
              label={p.secondaryLabel}
              variant="secondary"
              style={styles.mt10}
              onPress={() => go(p.secondaryRoute || 'EarnHome', p.secondaryParams)}
            />
          ) : null}
        </>
      }>
      <Animated.View style={[styles.ring, {transform: [{scale}], opacity}]}>
        <View style={styles.inner}>
          <Ionicons name="checkmark" size={40} color={colors.success} />
        </View>
      </Animated.View>
      <Text style={styles.title}>{p.title || 'Success'}</Text>
      {p.message ? <Text style={styles.message}>{p.message}</Text> : null}
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  center: {alignItems: 'center', justifyContent: 'center', paddingBottom: 40},
  ring: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {color: colors.success, fontSize: font.xxl - 4, fontWeight: '700', marginTop: spacing.xl},
  message: {
    color: colors.textSecondary,
    fontSize: font.sm,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 290,
  },
  mt10: {marginTop: 10},
}));
