import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// 1단계: 로그인 확인용 홈. 파티 생성·참여는 2단계에서 이 화면에 붙인다.
export default function HomeScreen() {
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from('profiles').select('nickname').eq('id', data.user.id).single();
      setNickname(profile?.nickname ?? '');
    });
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.inner}>
        <ThemedText type="subtitle">{nickname ? `${nickname}님, 안녕하세요` : '안녕하세요'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">파티 만들기·참여는 다음 단계에서 추가됩니다.</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut()}>
          <ThemedText type="link">로그아웃</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three,
    padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.three,
  },
});
