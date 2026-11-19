import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {Button, IconCircle} from './ui';
import {useVaultColors, makeStyles, spacing, font} from '../theme';

const getTones = colors => ({
  primary: {fg: colors.primary, bg: colors.primarySoft},
  danger: {fg: colors.danger, bg: colors.dangerSoft},
  success: {fg: colors.success, bg: colors.successSoft},
});

export default function EmptyState({
  icon = 'file-tray-outline',
  tone = 'primary',
  title,
  message,
  actionLabel,
  actionVariant = 'primary',
  onAction,
  secondaryLabel,
  onSecondary,
  style,
}) {
  const colors = useVaultColors();
  const styles = useStyles();
  const TONES = getTones(colors);
  const t = TONES[tone] || TONES.primary;
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.ring, {borderColor: t.bg}]}>
        <IconCircle name={icon} color={t.fg} bg={t.bg} size={60} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel ? (
        <Button label={actionLabel} onPress={onAction} variant={actionVariant} size="md" style={styles.btn} />
      ) : null}
      {secondaryLabel ? (
        <TouchableOpacity onPress={onSecondary} style={styles.secondary}>
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  wrap: {alignItems: 'center', paddingVertical: 48, paddingHorizontal: spacing.xl},
  ring: {padding: 8, borderRadius: 50, borderWidth: 1},
  title: {color: colors.text, fontSize: font.lg, fontWeight: '600', marginTop: spacing.lg, textAlign: 'center'},
  message: {
    color: colors.textSecondary,
    fontSize: font.sm,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 260,
  },
  btn: {marginTop: spacing.xl, minWidth: 160},
  secondary: {marginTop: spacing.md, padding: spacing.xs},
  secondaryText: {color: colors.textMuted, fontSize: font.sm},
}));
