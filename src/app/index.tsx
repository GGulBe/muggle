import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { STATUS_LABEL, type Party } from '@/lib/party';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const theme = useTheme();
  const [nickname, setNickname] = useState('');
  const [parties, setParties] = useState<Party[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'join' | null>(null);

  // 화면에 돌아올 때마다 새로 불러온다 (파티 화면에서 돌아온 경우 등)
  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) return;
        const { data: profile } = await supabase.from('profiles').select('nickname').eq('id', data.user.id).single();
        setNickname(profile?.nickname ?? '');
      });
      // RLS가 내가 속한 파티만 돌려준다
      supabase
        .from('parties')
        .select('id, code, host_id, status, created_at')
        .order('created_at', { ascending: false })
        .then(({ data }) => setParties(data ?? []));
    }, []),
  );

  const joinParty = async () => {
    setBusy('join');
    const { data, error } = await supabase.rpc('join_party', { p_code: code });
    setBusy(null);
    if (error) return Alert.alert('참여하지 못했어요', joinError(error.message));
    setCode('');
    router.push(`/party/${data}`);
  };

  return (
    <ThemedView style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={parties}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="subtitle">{nickname ? `${nickname}님,` : '안녕하세요'}</ThemedText>
            <ThemedText themeColor="textSecondary">어디서 만날지 정해 볼까요?</ThemedText>
            <Button title="새 파티 만들기" onPress={() => router.push('/new')} />
            <View style={styles.joinRow}>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="초대 코드 6자리"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                accessibilityLabel="초대 코드"
                style={[
                  styles.input,
                  { color: theme.text, borderColor: theme.textSecondary, letterSpacing: code ? 4 : 0 },
                ]}
              />
              <Button
                title="참여"
                variant="secondary"
                onPress={joinParty}
                disabled={code.length !== 6}
                busy={busy === 'join'}
              />
            </View>
            {parties.length > 0 && <ThemedText type="smallBold">내 파티</ThemedText>}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/party/${item.id}`)}
            style={[styles.row, { borderColor: theme.backgroundSelected }]}>
            <ThemedText>{item.code}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {STATUS_LABEL[item.status]}
            </ThemedText>
          </Pressable>
        )}
        ListFooterComponent={
          <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut()} style={styles.logout}>
            <ThemedText type="small" themeColor="textSecondary">
              로그아웃
            </ThemedText>
          </Pressable>
        }
      />
    </ThemedView>
  );
}

// 서버 오류 메시지(영문)를 사용자 문구로
function joinError(message: string) {
  if (message.includes('not found')) return '코드에 맞는 파티가 없어요. 코드를 다시 확인해 주세요.';
  if (message.includes('full')) return '파티 인원이 가득 찼어요 (최대 8명).';
  if (message.includes('started')) return '이미 투표가 시작된 파티예요.';
  return message;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  header: { gap: Spacing.three, marginBottom: Spacing.two },
  joinRow: { flexDirection: 'row', gap: Spacing.two },
  input: { flex: 1, height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 18 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderWidth: 1, borderRadius: 12,
  },
  logout: { alignItems: 'center', padding: Spacing.four },
});
