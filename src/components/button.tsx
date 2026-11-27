import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { Neo, Palette } from '@/constants/theme';

type Props = PressableProps & { title: string; busy?: boolean; variant?: 'primary' | 'secondary' };

export function Button({ title, busy, variant = 'primary', disabled, style, ...rest }: Props) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      style={(state) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        disabled && (primary ? styles.primaryOff : { opacity: 0.4, boxShadow: 'none' }),
        state.pressed && !disabled && Neo.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {busy ? (
        <ActivityIndicator color={primary ? Palette.white : Palette.ink} />
      ) : (
        <Text style={[styles.text, { color: primary ? (disabled ? Palette.muted : Palette.white) : Palette.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 48, ...Neo.box, ...Neo.shadow, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primary: { backgroundColor: Palette.red },
  primaryOff: { backgroundColor: Palette.line, borderColor: Palette.muted, boxShadow: 'none' },
  secondary: { backgroundColor: Palette.white },
  text: { fontSize: 16, fontWeight: '800' },
});
