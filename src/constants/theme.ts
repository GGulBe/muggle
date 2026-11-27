/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// 팔레트: Polar White 60% (바탕) · Glacier Blue 30% (선택·칩·데이터) · Racing Red 10% (주요 버튼·확정·핵심 숫자 하나)
export const Palette = {
  polar: '#F1F3F4', // 바탕
  white: '#FFFFFF', // 카드
  glacier: '#9CC6E0', // 선택 테두리, 이동시간 막대, 룰렛
  glacierSoft: '#E3EEF5', // 선택된 칩·카드 바탕
  glacierDeep: '#3F6F8F', // 빙하색 위의 글자·아이콘 (대비 4.5:1 이상)
  red: '#E4002B', // 포인트 (흰 글자 대비 4.9:1)
  ink: '#1D2A33', // 본문
  slate: '#4E6B80', // 큰 제목·숫자 (레퍼런스의 'Made to fly' 색)
  secondary: '#4F606C', // 보조 글자
  muted: '#66757F', // 메타·캡션
  line: '#DCE2E6', // 테두리 (hairline)
} as const;

const light = {
  text: Palette.ink,
  background: Palette.polar,
  backgroundElement: Palette.white,
  backgroundSelected: Palette.line,
  textSecondary: Palette.secondary,
  muted: Palette.muted,
  slate: Palette.slate,
  accent: Palette.red,
  glacier: Palette.glacier,
  glacierSoft: Palette.glacierSoft,
} as const;

// ponytail: 팔레트가 밝은 화면 기준이라 라이트만 쓴다 (app.json userInterfaceStyle: light). 다크가 필요하면 여기서 분리
export const Colors = { light, dark: light } as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

// 4px 격자
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  twoHalf: 12,
  three: 16,
  threeHalf: 20,
  four: 24,
  five: 32,
  six: 64,
} as const;

// 모서리: 칩·작은 버튼 8, 행·입력·버튼 12, 카드 16
export const Radius = { chip: 8, control: 12, card: 16 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
