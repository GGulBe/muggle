import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LoginScreen } from '@/components/login-screen';
import { Palette } from '@/constants/theme';
import { setSessionFromUrl, supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

// 로그인 후 '앱으로 돌아가기'로 앱이 열린 경우 (iOS 등)
const handleAuthLink = (url: string | null) => {
  if (url?.includes('auth-callback')) setSessionFromUrl(url).catch((e) => console.warn('login link:', e));
};

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = 확인 중

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    Linking.getInitialURL().then(handleAuthLink);
    const link = Linking.addEventListener('url', ({ url }) => handleAuthLink(url));
    return () => {
      data.subscription.unsubscribe();
      link.remove();
    };
  }, []);

  return (
    <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: Palette.polar, card: Palette.polar, text: Palette.ink, primary: Palette.red, border: Palette.line } }}>
      <AnimatedSplashOverlay />
      {session === undefined ? null : session ? (
        <Stack
          screenOptions={{
            headerBackTitle: '뒤로',
            headerShadowVisible: false,
            headerTintColor: Palette.ink,
            headerTitleStyle: { fontSize: 17, fontWeight: '500' },
            contentStyle: { backgroundColor: Palette.polar },
          }}>
          <Stack.Screen name="index" options={{ title: 'muggle' }} />
          <Stack.Screen name="party/[id]/index" options={{ title: '파티' }} />
          <Stack.Screen name="party/[id]/pin" options={{ title: '출발지 설정' }} />
          <Stack.Screen name="party/[id]/dates" options={{ title: '가능한 날짜' }} />
          <Stack.Screen name="party/[id]/review" options={{ title: '후기' }} />
          <Stack.Screen name="party/[id]/place" options={{ title: '가게 정보' }} />
          <Stack.Screen name="new" options={{ title: '새 파티' }} />
          <Stack.Screen name="preferences" options={{ title: '내 취향' }} />
          <Stack.Screen name="join/[code]" options={{ title: '파티 참여' }} />
        </Stack>
      ) : (
        // ponytail: 로그아웃 상태로 초대 링크를 열면 로그인 후 홈으로 간다. 코드 입력으로 참여 가능
        <LoginScreen />
      )}
    </ThemeProvider>
  );
}
