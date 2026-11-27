import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { isConfigured, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession(); // 웹에서만 필요
const redirectTo = makeRedirectUri(); // Expo Go: exp://<IP>:8081 → Supabase Redirect URLs에 exp://** 등록 필요

async function signInWithKakao() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const res = await WebBrowser.openAuthSessionAsync(data.url ?? '', redirectTo);
  if (res.type !== 'success') return; // 사용자가 닫음
  // 토큰은 redirect URL의 #fragment(또는 ?query)로 돌아온다
  const params = Object.fromEntries(new URLSearchParams(res.url.split(/[?#]/).slice(1).join('&')));
  if (params.error) throw new Error(params.error_description ?? params.error);
  if (!params.access_token) throw new Error('로그인 응답에 토큰이 없습니다');
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  if (sessionError) throw sessionError;
}

export function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onPress = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await signInWithKakao();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.inner}>
        <ThemedText type="subtitle">어디서 만나?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          출발지와 가능한 날짜만 입력하면{'\n'}모두에게 공평한 약속 장소를 추천해요
        </ThemedText>
        {isConfigured ? (
          <Pressable
            accessibilityRole="button"
            onPress={onPress}
            disabled={busy}
            style={({ pressed }) => [styles.kakao, pressed && { opacity: 0.8 }]}>
            {busy ? <ActivityIndicator color="#191919" /> : <Text style={styles.kakaoText}>카카오로 시작하기</Text>}
          </Pressable>
        ) : (
          <ThemedText type="small" style={styles.center}>
            .env.local에 EXPO_PUBLIC_SUPABASE_URL과 EXPO_PUBLIC_SUPABASE_KEY를 넣고 앱을 다시 실행하세요.
          </ThemedText>
        )}
        {message && (
          <ThemedText type="small" style={[styles.center, { color: '#d93025' }]}>
            {message}
          </ThemedText>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.four, padding: Spacing.four },
  center: { textAlign: 'center' },
  // 카카오 로그인 버튼 가이드: #FEE500 배경, 85% 검정 글자
  kakao: {
    alignSelf: 'stretch', maxWidth: 360, height: 52, borderRadius: 12,
    backgroundColor: '#FEE500', alignItems: 'center', justifyContent: 'center',
  },
  kakaoText: { color: 'rgba(0,0,0,0.85)', fontSize: 16, fontWeight: '600' },
});
