import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, Palette, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  // 제목(title·subtitle)은 슬레이트, 나머지는 테마 글자색. themeColor를 주면 그 색
  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], themeColor && { color: theme[themeColor] }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  // 위계는 굵기보다 크기·색으로. 굵기는 400·500, 강조만 600
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
  },
  title: {
    fontSize: 36,
    fontWeight: 600,
    lineHeight: 44,
    color: Palette.slate,
  },
  subtitle: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: 600,
    color: Palette.slate,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: Palette.slate,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
