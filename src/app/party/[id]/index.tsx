import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Share, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { inviteUrl, MAX_MEMBERS, STATUS_LABEL, type Member, type Party } from '@/lib/party';
import { supabase } from '@/lib/supabase';

export default function PartyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [party, setParty] = useState<Party | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: m }, { data: u }] = await Promise.all([
      supabase.from('parties').select('id, code, host_id, status, created_at').eq('id', id).single(),
      supabase
        .from('party_members')
        .select('user_id, lat, lng, has_car, input_done, vote_done, profiles(nickname)')
        .eq('party_id', id)
        .order('joined_at'),
      supabase.auth.getUser(),
    ]);
    setParty(p);
    setMembers((m as Member[] | null) ?? []);
    setMe(u.user?.id ?? null);
  }, [id]);

  // 출발지 화면에서 돌아오면 다시 불러오고, 다른 멤버의 변화는 실시간으로 받는다
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    const channel = supabase
      .channel(`party:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_members', filter: `party_id=eq.${id}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parties', filter: `id=eq.${id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  const mine = members.find((m) => m.user_id === me);
  const editable = party?.status === 'gathering' && mine && !mine.input_done;

  const share = () => {
    if (!party) return;
    Share.share({
      message: `muggle에서 약속 장소를 같이 정해요!\n초대 코드: ${party.code}\n${inviteUrl(party.code)}`,
    });
  };

  const setCar = async (value: boolean) => {
    setMembers((list) => list.map((m) => (m.user_id === me ? { ...m, has_car: value } : m)));
    const { error } = await supabase.from('party_members').update({ has_car: value }).eq('party_id', id).eq('user_id', me!);
    if (error) {
      Alert.alert('저장하지 못했어요', error.message);
      load();
    }
  };

  if (!party) return <ThemedView style={styles.container} />;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: `파티 ${party.code}` }} />
      <FlatList
        contentContainerStyle={styles.content}
        data={members}
        keyExtractor={(m) => m.user_id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                초대 코드 · {STATUS_LABEL[party.status]}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.code} selectable>
                {party.code}
              </ThemedText>
              <Button title="초대하기" variant="secondary" onPress={share} />
            </View>

            {mine && (
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">내 입력</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {mine.lat != null ? '출발지 설정됨' : '아직 출발지를 정하지 않았어요'}
                </ThemedText>
                <Button
                  title={mine.lat != null ? '출발지 바꾸기' : '출발지 정하기'}
                  onPress={() => router.push(`/party/${id}/pin`)}
                  disabled={!editable}
                />
                <View style={styles.switchRow}>
                  <ThemedText>자차로 이동해요</ThemedText>
                  <Switch value={mine.has_car} onValueChange={setCar} disabled={!editable} accessibilityLabel="자차 이용" />
                </View>
              </View>
            )}

            <ThemedText type="smallBold">
              멤버 {members.length}/{MAX_MEMBERS}
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.member, { borderColor: theme.backgroundSelected }]}>
            <ThemedText>
              {item.profiles?.nickname || '이름 없음'}
              {item.user_id === me ? ' (나)' : ''}
              {item.user_id === party.host_id ? ' · 방장' : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[item.lat != null ? '출발지 ✓' : '출발지 –', item.has_car ? '자차' : null, item.input_done ? '입력 완료' : null]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          </View>
        )}
        ListFooterComponent={
          members.length < 2 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              2명 이상 모여야 추천을 받을 수 있어요. 초대 코드를 공유해 주세요.
            </ThemedText>
          ) : undefined
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  header: { gap: Spacing.three, marginBottom: Spacing.two },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  code: { letterSpacing: 6 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  member: { padding: 14, borderWidth: 1, borderRadius: 12, gap: 2 },
  hint: { textAlign: 'center', marginTop: Spacing.three },
});
