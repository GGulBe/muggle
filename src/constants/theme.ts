/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// 팔레트: Polar White 60% (바탕) · Glacier Blue 30% (주요 카드 면·선택) · Racing Red 10% (주요 버튼·확정 결과)
// 스타일: 네오 브루탈리즘 — 잉크색 굵은 테두리, 흐림 없는 그림자, 8px 모서리
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

// 모서리: 네오 브루탈리즘이라 전부 8 (살짝 둥글게)
export const Radius = { chip: 8, control: 8, card: 8 } as const;

// 네오 브루탈리즘 공통 스타일: 잉크 테두리 + 오른쪽 아래로 밀린 단색 그림자 (RN boxShadow, 새 아키텍처)
export const Neo = {
  box: { borderWidth: 2, borderColor: Palette.ink, borderRadius: Radius.card },
  shadow: { boxShadow: `4px 4px 0px ${Palette.ink}` },
  shadowSm: { boxShadow: `2px 2px 0px ${Palette.ink}` },
  // 누르면 그림자 쪽으로 눌려 들어간다
  pressed: { transform: [{ translateX: 4 }, { translateY: 4 }], boxShadow: 'none' },
  pressedSm: { transform: [{ translateX: 2 }, { translateY: 2 }], boxShadow: 'none' },
  // 칩·선택 블록: 꺼짐 = 흰색, 켜짐 = Glacier Blue + 작은 그림자
  off: { borderWidth: 2, borderColor: Palette.ink, backgroundColor: Palette.white },
  on: { borderWidth: 2, borderColor: Palette.ink, backgroundColor: Palette.glacier, boxShadow: `2px 2px 0px ${Palette.ink}` },
  input: { borderWidth: 2, borderColor: Palette.ink, borderRadius: Radius.control, backgroundColor: Palette.white },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
