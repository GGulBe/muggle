import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatDay, inviteUrl, MAX_MEMBERS, PARTY_DETAIL_SELECT, SLOT_LABEL, STATUS_LABEL,
  type Candidate, type Member, type PartyDetail,
} from '@/lib/party';
import { supabase } from '@/lib/supabase';

export default function PartyScreen() {
  // 화면 간 전달 값: id(필수), welcome(새 파티·참여 화면이 보냄), address(출발지 화면이 돌려줌)
  const { id, welcome, address } = useLocalSearchParams<{ id: string; welcome?: 'created' | 'joined'; address?: string }>();
  const theme = useTheme();
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [myDates, setMyDates] = useState(0);
  const [myPrefs, setMyPrefs] = useState(0);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState<'done' | 'recommend' | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: m }, { data: u }, dates, prefs] = await Promise.all([
      supabase.from('parties').select(PARTY_DETAIL_SELECT).eq('id', id).single(),
      supabase
        .from('party_members')
        .select('user_id, lat, lng, has_car, input_done, vote_done, profiles(nickname)')
        .eq('party_id', id)
        .order('joined_at'),
      supabase.auth.getUser(),
      supabase.from('availabilities').select('*', { count: 'exact', head: true }).eq('party_id', id),
      supabase.from('preferences').select('*', { count: 'exact', head: true }),
    ]);
    const detail = p as unknown as PartyDetail | null;
    setParty(detail);
    setMembers((m as Member[] | null) ?? []);
    setMe(u.user?.id ?? null);
    setMyDates(dates.count ?? 0);
    setMyPrefs(prefs.count ?? 0);
    if (detail && detail.status !== 'gathering') {
      const { data: c } = await supabase
        .from('candidates')
        .select('place_id, score, max_min, avg_min, places(name, category, stations(name))')
        .eq('party_id', id)
        .eq('round', detail.round)
        .order('score');
      setCandidates((c as Candidate[] | null) ?? []);
    }
  }, [id]);

  // 입력 화면에서 돌아오면 다시 불러오고, 다른 멤버의 변화는 실시간으로 받는다
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
  const isHost = party?.host_id === me;
  const gathering = party?.status === 'gathering';
  const editable = gathering && mine && !mine.input_done;
  const allDone = members.length >= 2 && members.every((m) => m.input_done);

  const recommend = async () => {
    setBusy('recommend');
    const { error } = await supabase.functions.invoke('recommend', { body: { party_id: id } });
    setBusy(null);
    if (error) Alert.alert('추천하지 못했어요', '잠시 후 "추천 받기"를 다시 눌러 주세요.');
    load();
  };

  const toggleDone = async () => {
    setBusy('done');
    const { data, error } = await supabase.rpc('set_done', { p: id, p_done: !mine?.input_done });
    setBusy(null);
    if (error) {
      const msg = error.message.includes('required')
        ? '출발지와 가능 날짜를 하나 이상 정해야 완료할 수 있어요.'
        : error.message;
      return Alert.alert('완료하지 못했어요', msg);
    }
    // 마지막으로 완료한 사람이 추천을 실행한다 (실패하면 누구나 '추천 받기'로 다시 실행)
    if (data === 'ready') return recommend();
    load();
  };

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

  const removeOrLeave = () => {
    const [title, body, rpc] = isHost
      ? ['파티를 삭제할까요?', '모든 멤버의 입력과 투표가 함께 지워지고 되돌릴 수 없어요.', 'delete_party']
      : ['파티에서 나갈까요?', '내 출발지·가능 날짜가 이 파티에서 지워져요.', 'leave_party'];
    Alert.alert(title, body, [
      { text: '취소', style: 'cancel' },
      {
        text: isHost ? '삭제' : '나가기',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc(rpc, { p: id });
          if (error) {
            const msg = error.message.includes('started') ? '투표가 시작된 뒤에는 나갈 수 없어요.' : error.message;
            return Alert.alert(isHost ? '삭제하지 못했어요' : '나가지 못했어요', msg);
          }
          router.dismissTo('/');
        },
      },
    ]);
  };

  if (!party) return <ThemedView style={styles.container} />;

  const fixedLabel =
    party.fixed_mode === 'region' ? `동네 고정: ${party.fixed_station?.name} ${party.fixed_radius_km}km`
    : party.fixed_mode === 'place' ? `장소 고정: ${party.fixed_place?.name}`
    : null;
  const when = party.final_date && party.final_slot
    ? `${formatDay(party.final_date)} ${SLOT_LABEL[party.final_slot]}` : null;

  const step = (label: string, value: string, ok: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!editable}
      style={[styles.step, { borderColor: theme.backgroundSelected, opacity: editable ? 1 : 0.6 }]}>
      <ThemedText>{ok ? '✓ ' : '○ '}{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.stepValue}>{value} ›</ThemedText>
    </Pressable>
  );

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
                초대 코드 · {STATUS_LABEL[party.status]}{fixedLabel ? ` · ${fixedLabel}` : ''}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.code} selectable>{party.code}</ThemedText>
              {gathering && <Button title="초대하기" variant="secondary" onPress={share} />}
            </View>

            {welcome && gathering && (
              <View style={[styles.card, { backgroundColor: '#208AEF22' }]}>
                <ThemedText type="smallBold">{welcome === 'created' ? '🎉 파티를 만들었어요' : '👋 파티에 참여했어요'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {welcome === 'created' ? '초대하기로 친구들에게 코드를 보내 주세요.' : '출발지와 가능한 날짜를 입력해 주세요.'}
                </ThemedText>
              </View>
            )}

            {/* 추천 결과 (투표는 4단계) */}
            {!gathering && (
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">{party.status === 'closed' ? '확정됐어요' : '추천 장소'}</ThemedText>
                {when && <ThemedText>📅 {when}</ThemedText>}
                {party.final_place && <ThemedText>📍 {party.final_place.name}</ThemedText>}
                {party.status === 'voting' && candidates.map((c, i) => (
                  <View key={c.place_id} style={[styles.candidate, { borderColor: theme.backgroundSelected }]}>
                    <ThemedText>{i + 1}. {c.places?.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {c.places?.category} · {c.places?.stations?.name}
                      {party.fixed_mode === 'none' ? ` · 최대 ${Math.round(c.max_min)}분 · 평균 ${Math.round(c.avg_min)}분` : ''}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}

            {gathering && mine && (
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">내 입력</ThemedText>
                {step('출발지', mine.lat != null ? address || '설정됨' : '정하기', mine.lat != null, () =>
                  router.push({ pathname: '/party/[id]/pin', params: { id, code: party.code, lat: mine.lat ?? '', lng: mine.lng ?? '' } }))}
                {step('가능한 날짜', myDates ? `${myDates}개` : '고르기', myDates > 0, () =>
                  router.push({ pathname: '/party/[id]/dates', params: { id, code: party.code } }))}
                {step('내 취향 (비공개)', myPrefs ? `${myPrefs}개` : '선택', myPrefs > 0, () => router.push('/preferences'))}
                <View style={styles.switchRow}>
                  <ThemedText>자차로 이동해요</ThemedText>
                  <Switch value={mine.has_car} onValueChange={setCar} disabled={!editable} accessibilityLabel="자차 이용" />
                </View>
                <Button
                  title={mine.input_done ? '입력 완료 취소' : '입력 완료'}
                  variant={mine.input_done ? 'secondary' : 'primary'}
                  onPress={toggleDone}
                  busy={busy === 'done'}
                />
                {allDone && (
                  <Button title="추천 받기" onPress={recommend} busy={busy === 'recommend'} />
                )}
              </View>
            )}

            <ThemedText type="smallBold">
              멤버 {members.length}/{MAX_MEMBERS}
              {gathering ? ` · 입력 완료 ${members.filter((m) => m.input_done).length}명` : ''}
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
              {[item.lat != null ? '출발지 ✓' : '출발지 –', item.has_car ? '자차' : null, item.input_done ? '입력 완료 ✓' : '입력 중']
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            {members.length < 2 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                2명 이상 모여야 추천을 받을 수 있어요. 초대 코드를 공유해 주세요.
              </ThemedText>
            )}
            {(isHost || gathering) && (
              <Pressable accessibilityRole="button" onPress={removeOrLeave} style={styles.danger}>
                <ThemedText type="small" style={{ color: '#d93025' }}>{isHost ? '파티 삭제' : '파티 나가기'}</ThemedText>
              </Pressable>
            )}
          </View>
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
  step: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 14 },
  stepValue: { flexShrink: 1, marginLeft: Spacing.three, textAlign: 'right' },
  candidate: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  member: { padding: 14, borderWidth: 1, borderRadius: 12, gap: 2 },
  hint: { textAlign: 'center' },
  footer: { gap: Spacing.three, marginTop: Spacing.three },
  danger: { alignItems: 'center', padding: Spacing.three },
});
