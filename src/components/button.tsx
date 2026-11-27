import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { Palette, Radius } from '@/constants/theme';

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
        disabled && (primary ? styles.primaryOff : { opacity: 0.4 }),
        state.pressed && !disabled && styles.pressed,
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
  base: { height: 48, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  primary: { backgroundColor: Palette.red },
  primaryOff: { backgroundColor: Palette.line },
  secondary: { backgroundColor: Palette.white, borderWidth: 1, borderColor: Palette.line },
  text: { fontSize: 16, fontWeight: '600' },
});
