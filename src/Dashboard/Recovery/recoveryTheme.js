import {colors} from '../../Screens/ThemeColorsConfig';

export function createRecoveryTheme(isDark) {
  const palette = isDark ? colors.dark : colors.light;

  return {
    background: palette.bg,
    surface: palette.cardBg,
    input: isDark ? '#17171C' : '#FFFFFF',
    text: palette.headingTx,
    subtext: palette.cardSubTx,
    muted: palette.inactiveTx,
    border: palette.smallCardBorderColor,
    primary: palette.buttonColor,
    success: palette.success,
    error: palette.fail,
  };
}
