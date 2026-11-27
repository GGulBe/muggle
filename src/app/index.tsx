import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, SLOT_LABEL, STATUS_LABEL, type Party, type Slot } from '@/lib/party';
import { supabase } from '@/lib/supabase';

type Row = Party & { final_date: string | null; final_slot: Slot | null; final_place: { name: string } | null };

export default function HomeScreen() {
  const theme = useTheme();
  const [nickname, setNickname] = useState('');
  const [parties, setParties] = useState<Row[]>([]);
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
        .select('id, code, host_id, status, created_at, final_date, final_slot, final_place:places!final_place_id(name)')
        .order('created_at', { ascending: false })
        .then(({ data }) => setParties((data as unknown as Row[] | null) ?? []));
    }, []),
  );

  const joinParty = async () => {
    setBusy('join');
    const { data, error } = await supabase.rpc('join_party', { p_code: code });
    setBusy(null);
    if (error) return Alert.alert('참여하지 못했어요', joinError(error.message));
    setCode('');
    router.push({ pathname: '/party/[id]', params: { id: data, welcome: 'joined' } });
  };

  return (
    <ThemedView style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={parties}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <ThemedText type="subtitle">약속 정하기</ThemedText>
              <ThemedText themeColor="textSecondary">출발지만 넣으면 모두에게 공평한 곳을 찾아요</ThemedText>
            </View>
            <Button title="새 파티 만들기" onPress={() => router.push('/new')} />
            <View style={styles.joinRow}>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="초대 코드 6자리"
                placeholderTextColor={theme.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                accessibilityLabel="초대 코드"
                style={[
                  styles.input,
                  { color: theme.text, letterSpacing: code ? 4 : 0 },
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
            {parties.length > 0 && <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>내 파티 {parties.length}</ThemedText>}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 5) * 50).duration(300)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`파티 ${item.code}, ${STATUS_LABEL[item.status]}`}
              onPress={() => router.push(`/party/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.rowText}>
                <ThemedText style={styles.code}>{item.code}</ThemedText>
                {item.status === 'closed' && item.final_date && item.final_slot ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {formatDay(item.final_date)} {SLOT_LABEL[item.final_slot]}{item.final_place ? ` · ${item.final_place.name}` : ''}
                  </ThemedText>
                ) : null}
              </View>
              <View style={[styles.status, item.status === 'voting' && styles.statusVoting, item.status === 'closed' && styles.statusClosed]}>
                <ThemedText type="small" style={[styles.statusText, item.status === 'voting' && { color: Palette.glacierDeep }, item.status === 'closed' && { color: Palette.white }]}>
                  {STATUS_LABEL[item.status]}
                </ThemedText>
              </View>
              <ChevronRight size={18} strokeWidth={1.5} color={Palette.muted} />
            </Pressable>
          </Animated.View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            {nickname ? <ThemedText type="small" themeColor="muted">{nickname}</ThemedText> : null}
            <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut()} hitSlop={12}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.underline}>로그아웃</ThemedText>
            </Pressable>
          </View>
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
  titleBlock: { gap: Spacing.one, marginTop: Spacing.two, marginBottom: Spacing.two },
  section: { marginTop: Spacing.four },
  joinRow: { flexDirection: 'row', gap: Spacing.two },
  input: {
    flex: 1, height: 48, borderWidth: 1, borderColor: Palette.line, borderRadius: Radius.control,
    backgroundColor: Palette.white, paddingHorizontal: Spacing.three, fontSize: 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf, minHeight: 64,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.twoHalf,
    backgroundColor: Palette.white, borderRadius: Radius.control,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  rowText: { flex: 1, gap: 2 },
  code: { fontWeight: '500', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  status: { borderRadius: Radius.chip, paddingHorizontal: Spacing.two, paddingVertical: 2, backgroundColor: Palette.polar },
  statusVoting: { backgroundColor: Palette.glacierSoft },
  statusClosed: { backgroundColor: Palette.red },
  statusText: { color: Palette.secondary },
  footer: { alignItems: 'center', gap: Spacing.one, padding: Spacing.five },
  underline: { textDecorationLine: 'underline' },
});
