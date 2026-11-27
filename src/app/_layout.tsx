import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { LoginScreen } from '@/components/login-screen';
import { setSessionFromUrl, supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

// 로그인 후 '앱으로 돌아가기'로 앱이 열린 경우 (안드로이드는 로그인 창 대신 이 경로로 올 수 있다)
const handleAuthLink = (url: string | null) => {
  if (url?.includes('auth-callback')) setSessionFromUrl(url).catch((e) => console.warn('login link:', e));
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
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
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {session === undefined ? null : session ? <AppTabs /> : <LoginScreen />}
    </ThemeProvider>
  );
}
