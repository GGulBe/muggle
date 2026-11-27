import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

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
        (disabled || state.pressed) && { opacity: 0.6 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {busy ? (
        <ActivityIndicator color={primary ? '#fff' : '#208AEF'} />
      ) : (
        <Text style={[styles.text, { color: primary ? '#fff' : '#208AEF' }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: '#208AEF' },
  secondary: { borderWidth: 1, borderColor: '#208AEF' },
  text: { fontSize: 16, fontWeight: '600' },
});
