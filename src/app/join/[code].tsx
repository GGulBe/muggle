import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// 초대 링크(muggle://join/CODE)로 열렸을 때: 참여 후 파티 화면으로
export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('join_party', { p_code: code }).then(({ data, error: e }) => {
      if (e) setError(e.message.includes('not found') ? '코드에 맞는 파티가 없어요.' : e.message);
      else router.replace(`/party/${data}`);
    });
  }, [code]);

  return (
    <ThemedView style={styles.container}>
      {error ? (
        <>
          <ThemedText style={styles.text}>{error}</ThemedText>
          <Button title="홈으로" onPress={() => router.replace('/')} />
        </>
      ) : (
        <ActivityIndicator />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  text: { textAlign: 'center' },
});
