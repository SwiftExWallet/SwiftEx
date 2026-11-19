import React, {useEffect} from 'react';
import {View, Text, BackHandler} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Screen, Spinner} from '../components/ui';
import {useVaultColors, makeStyles, spacing, font} from '../theme';

export default function ProcessingScreen({navigation, route}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const p = (route && route.params) || {};

  useEffect(() => {
    const t = setTimeout(() => {
      if (p.next) navigation.replace(p.next, p.nextParams);
    }, p.duration || 2200);

    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [navigation, p.next, p.nextParams, p.duration]);

  return (
    <Screen scroll={false} contentStyle={styles.center}>
      <Spinner size={76} />
      <Text style={styles.title}>{p.title || 'Processing...'}</Text>
      {p.subtitle ? <Text style={styles.sub}>{p.subtitle}</Text> : null}
      <View style={styles.hint}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
        <Text style={styles.hintText}>Please don't close the app</Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(colors => ({
  center: {alignItems: 'center', justifyContent: 'center', paddingBottom: 60},
  title: {color: colors.text, fontSize: font.lg, fontWeight: '600', marginTop: spacing.xxl},
  sub: {color: colors.textSecondary, fontSize: font.sm, marginTop: spacing.sm, textAlign: 'center'},
  hint: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl},
  hintText: {color: colors.textMuted, fontSize: font.xs, marginLeft: 4},
}));
