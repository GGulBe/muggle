import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Spacing } from '@/constants/theme';
import { isConfigured, setSessionFromUrl, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession(); // 웹에서만 필요
// Expo Go: exp://<IP>:<port>/--/auth-callback, 빌드: muggle://auth-callback
// 경로(/--/...) 없이 exp://<IP>:<port>만 쓰면 Expo Go가 '프로젝트 열기'로 보고 앱에 전달하지 않는다
const appUrl = Linking.createURL('auth-callback');

// 안드로이드 Custom Tab은 앱 주소로 돌아가는 링크를 막는다. 그래서 로그인 결과를 중간 페이지(docs/auth)가
// 일회용 번호표에 맡기고, 사용자가 창을 닫으면 앱이 번호표로 찾아온다.
// iOS는 중간 페이지가 앱 주소로 바로 돌려보낸다. (Supabase Redirect URLs에 중간 페이지 주소 등록 필요)
async function signInWithKakao() {
  const { data: ticket, error: ticketError } = await supabase.rpc('create_login_ticket');
  if (ticketError) throw ticketError;
  const bridgeUrl = `https://ggulbe.github.io/muggle/auth/?ticket=${ticket}&to=${encodeURIComponent(appUrl)}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: bridgeUrl, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const res = await WebBrowser.openAuthSessionAsync(data.url ?? '', appUrl);
  if (res.type === 'success' && (await setSessionFromUrl(res.url))) return;

  // 창을 닫고 돌아온 경우: 맡겨 둔 토큰을 찾아온다 (없으면 로그인하지 않고 닫은 것)
  const { data: rows, error: claimError } = await supabase.rpc('claim_login_ticket', { p_ticket: ticket });
  if (claimError) throw claimError;
  const tokens = rows?.[0];
  if (!tokens) return;
  const { error: sessionError } = await supabase.auth.setSession(tokens);
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
        <ThemedText type="subtitle">muggle</ThemedText>
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
          <ThemedText type="small" style={[styles.center, { color: Palette.red }]}>
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
