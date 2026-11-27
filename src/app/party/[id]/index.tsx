import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import * as Calendar from 'expo-calendar/legacy';
import { Alert, FlatList, Linking, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { ReactionBar } from '@/components/reaction-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatDay, inviteUrl, MAX_MEMBERS, PARTY_DETAIL_SELECT, SLOT_LABEL, SLOT_TIME, STATUS_LABEL,
  type Candidate, type Member, type PartyDetail, type Reaction,
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
  const [myVote, setMyVote] = useState<number | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [counts, setCounts] = useState<Map<number, number> | null>(null); // 확정 후에만 (개수만, 누가 뭘 골랐는지는 없음)
  const [placeReviews, setPlaceReviews] = useState<{ n: number; avg: number; mine: boolean } | null>(null);
  const [busy, setBusy] = useState<'done' | 'recommend' | 'vote' | null>(null);

  const loadReactions = useCallback(async (round: number) => {
    const { data } = await supabase.from('reactions').select('place_id, emoji, user_id').eq('party_id', id).eq('round', round).order('created_at');
    setReactions((data as Reaction[] | null) ?? []);
  }, [id]);

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
      // RLS: votes는 내 표만 보인다
      const { data: v } = await supabase.from('votes').select('place_id').eq('party_id', id).eq('round', detail.round).maybeSingle();
      setMyVote(v?.place_id ?? null);
      loadReactions(detail.round);
      // 확정 장소의 후기 요약 (앱 사용자 전체)
      if (detail.status === 'closed' && detail.final_place_id) {
        const { data: rv } = await supabase.from('reviews').select('rating, user_id, party_id').eq('place_id', detail.final_place_id);
        const list = rv ?? [];
        setPlaceReviews({
          n: list.length,
          avg: list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0,
          mine: list.some((r) => r.user_id === u.user?.id && r.party_id === id),
        });
      }
      if (detail.status === 'closed' && detail.fixed_mode !== 'place') {
        const { data: n } = await supabase.rpc('vote_counts', { p: id });
        setCounts(new Map(((n as { place_id: number; n: number }[] | null) ?? []).map((x) => [x.place_id, x.n])));
      } else setCounts(null);
    }
  }, [id, loadReactions]);

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
      // 이모지: 삭제 이벤트는 필터가 안 돼서 전체를 받고 이 파티 것만 거른다 (삭제 이벤트엔 키만 담김)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (e) => {
        const row = (e.new && 'party_id' in e.new ? e.new : e.old) as Partial<Reaction & { party_id: string; round: number }>;
        if (row.party_id === id && row.round != null) loadReactions(row.round);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load, loadReactions]);

  const mine = members.find((m) => m.user_id === me);
  const isHost = party?.host_id === me;
  const gathering = party?.status === 'gathering';
  const editable = gathering && mine && !mine.input_done;
  const allDone = members.length >= 2 && members.every((m) => m.input_done);
  const voting = party?.status === 'voting';
  const canVote = voting && mine && !mine.vote_done;

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

  // 투표: 한 사람 한 표, 투표 완료 전까지 바꿀 수 있음 (다른 사람에게는 보이지 않음)
  const vote = async (placeId: number) => {
    if (!canVote || !party || placeId === myVote) return;
    const before = myVote;
    setMyVote(placeId);
    const { error } = before == null
      ? await supabase.from('votes').insert({ party_id: id, round: party.round, place_id: placeId })
      : await supabase.from('votes').update({ place_id: placeId }).eq('party_id', id).eq('round', party.round).eq('user_id', me!);
    if (error) {
      setMyVote(before);
      Alert.alert('투표하지 못했어요', error.message);
    }
  };

  const toggleVoteDone = async () => {
    setBusy('vote');
    const { error } = await supabase.rpc('set_done', { p: id, p_done: !mine?.vote_done });
    setBusy(null);
    if (error) return Alert.alert('완료하지 못했어요', error.message.includes('vote first') ? '먼저 한 곳에 투표해 주세요.' : error.message);
    load();
  };

  // 이모지 반응: 실시간 공개, 누가 눌렀는지는 숫자로만 보여준다
  const react = async (placeId: number, emoji: string) => {
    if (!party) return;
    const mineOn = reactions.some((x) => x.place_id === placeId && x.emoji === emoji && x.user_id === me);
    setReactions((list) => mineOn
      ? list.filter((x) => !(x.place_id === placeId && x.emoji === emoji && x.user_id === me))
      : [...list, { place_id: placeId, emoji, user_id: me! }]);
    const { error } = mineOn
      ? await supabase.from('reactions').delete().match({ party_id: id, round: party.round, place_id: placeId, emoji, user_id: me })
      : await supabase.from('reactions').insert({ party_id: id, round: party.round, place_id: placeId, emoji });
    if (error) loadReactions(party.round);
  };

  const restart = (to: 'voting' | 'gathering') => {
    const [title, body] = to === 'voting'
      ? ['다시 투표할까요?', '같은 후보로 모두 다시 투표해요.']
      : ['처음부터 다시 정할까요?', '출발지·날짜를 다시 입력하고 새로 추천받아요.'];
    Alert.alert(title, body, [
      { text: '취소', style: 'cancel' },
      {
        text: '다시 하기',
        onPress: async () => {
          const { error } = await supabase.rpc('restart_party', { p: id, p_to: to });
          if (error) return Alert.alert('바꾸지 못했어요', error.message);
          load();
        },
      },
    ]);
  };

  // 휴대폰 기본 캘린더의 '일정 추가' 화면을 채워서 연다 (사용자가 저장)
  const addToCalendar = async () => {
    if (!party?.final_date || !party.final_slot) return;
    const [y, m, d] = party.final_date.split('-').map(Number);
    const [h, min, len] = SLOT_TIME[party.final_slot];
    const startDate = new Date(y, m - 1, d, h, min);
    try {
      await Calendar.createEventInCalendarAsync({
        title: `muggle 약속${party.final_place ? ` · ${party.final_place.name}` : ''}`,
        startDate,
        endDate: new Date(startDate.getTime() + len * 60_000),
        location: party.final_place?.name,
        notes: `파티 ${party.code}`,
      });
    } catch (e) {
      Alert.alert('캘린더를 열지 못했어요', e instanceof Error ? e.message : String(e));
    }
  };

  // 카카오맵 길찾기 (앱이 있으면 앱, 없으면 웹)
  const directions = () => {
    const p = party?.final_place;
    if (p) Linking.openURL(`https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}`);
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
              <Animated.View entering={FadeInDown.duration(300)} layout={LinearTransition} style={[styles.card, { backgroundColor: '#208AEF22' }]}>
                <ThemedText type="smallBold">{welcome === 'created' ? '파티를 만들었어요' : '파티에 참여했어요'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {welcome === 'created' ? '초대하기로 친구들에게 코드를 보내 주세요.' : '출발지와 가능한 날짜를 입력해 주세요.'}
                </ThemedText>
              </Animated.View>
            )}

            {/* 확정 */}
            {party.status === 'closed' && (
              <Animated.View entering={FadeInDown.duration(300)} layout={LinearTransition} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">약속이 정해졌어요</ThemedText>
                {when && <ThemedText type="subtitle" style={styles.when}>{when}</ThemedText>}
                {party.final_place && (
                  <ThemedText>
                    {party.final_place.name}
                    <ThemedText type="small" themeColor="textSecondary"> · {party.final_place.category} · {party.final_place.stations?.name}</ThemedText>
                  </ThemedText>
                )}
                {placeReviews && placeReviews.n > 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    <ThemedText type="small" style={styles.gold}>★</ThemedText> {placeReviews.avg.toFixed(1)} · 후기 {placeReviews.n}개
                  </ThemedText>
                )}
                <View style={styles.row}>
                  <Button title="캘린더에 추가" variant="secondary" onPress={addToCalendar} style={styles.flex} />
                  {party.final_place && <Button title="길찾기" variant="secondary" onPress={directions} style={styles.flex} />}
                </View>
                {party.final_place_id && (
                  <Button
                    title={placeReviews?.mine ? '내 후기 수정' : '다녀왔어요 · 후기 남기기'}
                    variant={placeReviews?.mine ? 'secondary' : 'primary'}
                    onPress={() => router.push({
                      pathname: '/party/[id]/review',
                      params: { id, place: party.final_place_id!, name: party.final_place?.name ?? '' },
                    })}
                  />
                )}
                {isHost && (
                  <View style={styles.row}>
                    {party.fixed_mode !== 'place' && (
                      <Pressable accessibilityRole="button" onPress={() => restart('voting')} style={styles.link}>
                        <ThemedText type="small" themeColor="textSecondary">다시 투표</ThemedText>
                      </Pressable>
                    )}
                    <Pressable accessibilityRole="button" onPress={() => restart('gathering')} style={styles.link}>
                      <ThemedText type="small" themeColor="textSecondary">처음부터 다시</ThemedText>
                    </Pressable>
                  </View>
                )}
              </Animated.View>
            )}

            {/* 투표 (후보) */}
            {!gathering && candidates.length > 0 && (
              <Animated.View entering={FadeInDown.duration(300)} layout={LinearTransition} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">{voting ? '어디로 갈까요? (익명 투표)' : '투표 결과'}</ThemedText>
                {voting && when && <ThemedText>{when}</ThemedText>}
                {voting && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {mine?.vote_done ? '투표를 마쳤어요. 모두 마치면 결과가 나와요.' : '한 곳을 눌러 투표하세요. 누가 어디에 투표했는지는 아무도 몰라요.'}
                  </ThemedText>
                )}
                {candidates.map((c, i) => {
                  const picked = myVote === c.place_id;
                  const won = party.status === 'closed' && c.place_id === party.final_place_id;
                  return (
                    <Animated.View
                      key={c.place_id}
                      entering={FadeInDown.delay(i * 60).duration(300)}
                      layout={LinearTransition}
                      style={[styles.candidate, { borderColor: picked ? '#208AEF' : theme.backgroundSelected, borderWidth: picked ? 2 : 1 }]}>
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected: picked, disabled: !canVote }}
                        disabled={!canVote}
                        onPress={() => vote(c.place_id)}
                        style={({ pressed }) => [styles.candidateMain, pressed && styles.pressed]}>
                        <View style={styles.flex}>
                          <ThemedText>{i + 1}. {c.places?.name}{won ? <ThemedText type="smallBold" style={styles.badge}>  확정</ThemedText> : null}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {c.places?.category} · {c.places?.stations?.name}
                            {party.fixed_mode === 'none' ? ` · 최대 ${Math.round(c.max_min)}분 · 평균 ${Math.round(c.avg_min)}분` : ''}
                          </ThemedText>
                        </View>
                        {counts ? (
                          <ThemedText type="smallBold">{counts.get(c.place_id) ?? 0}표</ThemedText>
                        ) : picked ? (
                          <Animated.View entering={FadeInDown.duration(200)}>
                            <ThemedText type="smallBold" style={styles.badge}>내 표</ThemedText>
                          </Animated.View>
                        ) : null}
                      </Pressable>
                      <ReactionBar
                        reactions={reactions.filter((x) => x.place_id === c.place_id)}
                        me={me}
                        onToggle={(e) => react(c.place_id, e)}
                      />
                    </Animated.View>
                  );
                })}
                {voting && mine && (
                  <Button
                    title={mine.vote_done ? '투표 완료 취소' : '투표 완료'}
                    variant={mine.vote_done ? 'secondary' : 'primary'}
                    onPress={toggleVoteDone}
                    disabled={!mine.vote_done && myVote == null}
                    busy={busy === 'vote'}
                  />
                )}
              </Animated.View>
            )}

            {gathering && mine && (
              <Animated.View entering={FadeInDown.duration(300)} layout={LinearTransition} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
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
              </Animated.View>
            )}

            <ThemedText type="smallBold">
              멤버 {members.length}/{MAX_MEMBERS}
              {gathering ? ` · 입력 완료 ${members.filter((m) => m.input_done).length}명` : ''}
              {voting ? ` · 투표 완료 ${members.filter((m) => m.vote_done).length}명` : ''}
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
              {[item.lat != null ? '출발지 ✓' : '출발지 –', item.has_car ? '자차' : null, gathering ? (item.input_done ? '입력 완료 ✓' : '입력 중') : voting ? (item.vote_done ? '투표 완료 ✓' : '투표 중') : null]
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
  candidate: { borderRadius: 12, padding: 12, gap: Spacing.two },
  candidateMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  badge: { color: '#208AEF' },
  gold: { color: '#F5B301' },
  when: { fontSize: 22, lineHeight: 30 },
  row: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'center' },
  flex: { flex: 1 },
  link: { padding: Spacing.two },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  member: { padding: 14, borderWidth: 1, borderRadius: 12, gap: 2 },
  hint: { textAlign: 'center' },
  footer: { gap: Spacing.three, marginTop: Spacing.three },
  danger: { alignItems: 'center', padding: Spacing.three },
});
