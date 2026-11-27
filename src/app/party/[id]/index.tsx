import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import * as Calendar from 'expo-calendar/legacy';
import { Alert, FlatList, Linking, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { Check, ChevronRight, Circle, CircleCheck } from 'lucide-react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { ReactionBar } from '@/components/reaction-bar';
import { Station } from '@/components/station';
import { Roulette } from '@/components/roulette';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
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
  const [myVotes, setMyVotes] = useState<Set<number>>(new Set()); // 여러 곳에 투표 가능
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [counts, setCounts] = useState<Map<number, number> | null>(null); // 확정 후에만 (개수만, 누가 뭘 골랐는지는 없음)
  const [revealed, setRevealed] = useState<string | null>(null); // 룰렛이 멈춘 결과 (멈추기 전엔 결과를 숨김)
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
      const { data: v } = await supabase.from('votes').select('place_id').eq('party_id', id).eq('round', detail.round);
      setMyVotes(new Set((v ?? []).map((x) => x.place_id)));
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
  // 최다 득표 동점 후보 (2곳 이상이면 룰렛)
  const top = counts ? Math.max(0, ...counts.values()) : 0;
  const tied = counts ? candidates.filter((c) => (counts.get(c.place_id) ?? 0) === top) : [];
  // 이동시간 막대: 후보 중 가장 긴 최대 이동시간을 100%로, 최대 이동시간이 가장 짧은 후보가 '가장 공평'
  const travelScale = Math.max(1, ...candidates.map((c) => c.max_min));
  const fairest = candidates.length ? candidates.reduce((a, b) => (b.max_min < a.max_min ? b : a)).place_id : null;
  const spinKey = party ? `${id}:${party.round}:${party.final_place_id}` : '';
  // 투표로 확정됐는데 득표수를 아직 못 불러왔거나, 동점 룰렛이 아직 도는 중이면 결과를 가린다
  const hideResult = party?.status === 'closed' && party.fixed_mode !== 'place' && (!counts || (tied.length > 1 && revealed !== spinKey));
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
        ? '출발지와 가능 날짜를 하나 이상 정해야 완료할 수 있어요'
        : error.message;
      return Alert.alert('완료하지 못했어요', msg);
    }
    // 마지막으로 완료한 사람이 추천을 실행한다 (실패하면 누구나 '추천 받기'로 다시 실행)
    if (data === 'ready') return recommend();
    load();
  };

  // 투표: 가고 싶은 곳 모두 (후보마다 한 표), 투표 완료 전까지 바꿀 수 있음. 다른 사람에게는 보이지 않음
  const vote = async (placeId: number) => {
    if (!canVote || !party) return;
    const on = myVotes.has(placeId);
    const flip = (prev: Set<number>) => {
      const next = new Set(prev);
      if (on) next.delete(placeId);
      else next.add(placeId);
      return next;
    };
    setMyVotes(flip);
    const { error } = on
      ? await supabase.from('votes').delete().match({ party_id: id, round: party.round, place_id: placeId }) // RLS: 내 표만
      : await supabase.from('votes').insert({ party_id: id, round: party.round, place_id: placeId });
    if (error) {
      setMyVotes(flip);
      Alert.alert('투표하지 못했어요', error.message);
    }
  };

  // 동점 룰렛 다시 돌리기 (방장)
  const respin = async () => {
    const { error } = await supabase.rpc('respin', { p: id });
    if (error) Alert.alert('다시 돌리지 못했어요', error.message);
    load();
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
      ? ['파티를 삭제할까요?', '모든 멤버의 입력과 투표가 함께 지워지고 되돌릴 수 없어요', 'delete_party']
      : ['파티에서 나갈까요?', '내 출발지·가능 날짜가 이 파티에서 지워져요.', 'leave_party'];
    Alert.alert(title, body, [
      { text: '취소', style: 'cancel' },
      {
        text: isHost ? '삭제' : '나가기',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc(rpc, { p: id });
          if (error) {
            const msg = error.message.includes('started') ? '투표가 시작된 뒤에는 나갈 수 없어요' : error.message;
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
      style={({ pressed }) => [styles.step, !editable && styles.dim, pressed && styles.pressed]}>
      {ok
        ? <CircleCheck size={18} strokeWidth={1.5} color={Palette.glacierDeep} />
        : <Circle size={18} strokeWidth={1.5} color={Palette.muted} />}
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.stepValue}>{value}</ThemedText>
      <ChevronRight size={18} strokeWidth={1.5} color={Palette.muted} />
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
              <ThemedText type="title" style={styles.code} selectable>{party.code}</ThemedText>
              {gathering && <Button title="초대하기" variant="secondary" onPress={share} />}
            </View>

            {welcome && gathering && (
              <Animated.View entering={FadeInDown.duration(300)} layout={LinearTransition} style={[styles.card, { backgroundColor: Palette.glacierSoft }]}>
                <ThemedText type="smallBold">{welcome === 'created' ? '파티를 만들었어요' : '파티에 참여했어요'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {welcome === 'created' ? '초대하기로 친구들에게 코드를 보내 주세요' : '출발지와 가능한 날짜를 입력해 주세요'}
                </ThemedText>
              </Animated.View>
            )}

            {/* 확정 */}
            {party.status === 'closed' && (
              <Animated.View entering={FadeInDown.duration(300)} layout={LinearTransition} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">{tied.length > 1 ? `${tied.length}곳이 동점이라 룰렛으로 정했어요` : '약속이 정해졌어요'}</ThemedText>
                {tied.length > 1 && party.final_place_id && (
                  <>
                    <Roulette
                      items={tied.map((c) => ({ id: c.place_id, label: c.places?.name ?? '' }))}
                      winner={party.final_place_id}
                      playKey={spinKey}
                      onDone={setRevealed}
                    />
                    {isHost && !hideResult && <Button title="마음에 안 들면 다시 돌리기" variant="secondary" onPress={respin} />}
                  </>
                )}
                {when && <ThemedText type="subtitle">{when}</ThemedText>}
                {!hideResult && party.final_place && (
                  <View style={styles.finalPlace}>
                    <ThemedText style={styles.finalName}>{party.final_place.name}</ThemedText>
                    <View style={styles.metaRow}>
                      <ThemedText type="small" themeColor="textSecondary">{party.final_place.category}</ThemedText>
                      {party.final_place.stations && <Station name={party.final_place.stations.name} />}
                      {placeReviews && placeReviews.n > 0 && (
                        <ThemedText type="small" themeColor="textSecondary">★ {placeReviews.avg.toFixed(1)} · 후기 {placeReviews.n}개</ThemedText>
                      )}
                    </View>
                  </View>
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
                {voting && when && <ThemedText type="subtitle">{when}</ThemedText>}
                {voting && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {mine?.vote_done ? '투표를 마쳤어요. 모두 마치면 결과가 나와요' : '가고 싶은 곳은 모두 골라도 돼요. 가게를 누르면 정보를 볼 수 있고, 누가 어디에 투표했는지는 아무도 몰라요'}
                  </ThemedText>
                )}
                {candidates.map((c, i) => {
                  const picked = myVotes.has(c.place_id);
                  const won = party.status === 'closed' && !hideResult && c.place_id === party.final_place_id;
                  return (
                    <Animated.View
                      key={c.place_id}
                      entering={FadeInDown.delay(i * 60).duration(300)}
                      layout={LinearTransition}
                      style={[styles.candidate, picked && styles.candidateOn]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityHint="가게 정보 보기"
                        onPress={() => router.push({
                          pathname: '/party/[id]/place',
                          params: {
                            id, place: c.place_id, round: party.round, canVote: canVote ? '1' : '',
                            ...(party.fixed_mode === 'none' ? { max: Math.round(c.max_min), avg: Math.round(c.avg_min) } : {}),
                          },
                        })}
                        style={({ pressed }) => [styles.candidateMain, pressed && styles.pressed]}>
                        <View style={styles.flex}>
                          <View style={styles.nameRow}>
                            <ThemedText style={styles.candName}>{c.places?.name}</ThemedText>
                            {won && <View style={styles.wonBadge}><ThemedText type="small" style={styles.wonText}>확정</ThemedText></View>}
                          </View>
                          <View style={styles.metaRow}>
                            <ThemedText type="small" themeColor="textSecondary">{c.places?.category}</ThemedText>
                            {c.places?.stations && <Station name={c.places.stations.name} />}
                          </View>
                          {party.fixed_mode === 'none' && (
                            <TravelBar max={c.max_min} avg={c.avg_min} scale={travelScale} fairest={voting && c.place_id === fairest} />
                          )}
                        </View>
                        {counts ? (
                          <ThemedText style={[styles.votes, won && { color: Palette.red }]}>{counts.get(c.place_id) ?? 0}<ThemedText type="small" themeColor="muted">표</ThemedText></ThemedText>
                        ) : voting ? (
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: picked, disabled: !canVote }}
                            accessibilityLabel={`${c.places?.name} 투표`}
                            disabled={!canVote}
                            hitSlop={8}
                            onPress={() => vote(c.place_id)}
                            style={({ pressed }) => [styles.voteBtn, picked && styles.voteOn, pressed && styles.pressed, !canVote && !picked && styles.dim]}>
                            {picked && <Check size={16} strokeWidth={2} color={Palette.ink} />}
                            <ThemedText type="small" style={styles.voteText}>{picked ? '투표함' : '투표'}</ThemedText>
                          </Pressable>
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
                    disabled={!mine.vote_done && myVotes.size === 0}
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
                  <Switch value={mine.has_car} onValueChange={setCar} disabled={!editable} accessibilityLabel="자차 이용" trackColor={{ true: Palette.glacier, false: Palette.line }} thumbColor={Palette.white} />
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
          <View style={styles.member}>
            {(gathering ? item.input_done : voting ? item.vote_done : true)
              ? <CircleCheck size={18} strokeWidth={1.5} color={Palette.glacierDeep} style={styles.memberIcon} />
              : <Circle size={18} strokeWidth={1.5} color={Palette.muted} style={styles.memberIcon} />}
            <View style={styles.flex}>
              <ThemedText>
                {item.profiles?.nickname || '이름 없음'}
                {item.user_id === me ? ' (나)' : ''}
                {item.user_id === party.host_id ? ' · 방장' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[item.lat != null ? '출발지 설정' : '출발지 미정', item.has_car ? '자차' : null, gathering ? (item.input_done ? '입력 완료' : '입력 중') : voting ? (item.vote_done ? '투표 완료' : '투표 중') : null]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
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
                <ThemedText type="small" style={{ color: Palette.red }}>{isHost ? '파티 삭제' : '파티 나가기'}</ThemedText>
              </Pressable>
            )}
          </View>
        }
      />
    </ThemedView>
  );
}

// 모먼트: 후보마다 이동시간을 노선 막대로. 빙하색 막대 = 가장 오래 걸리는 사람, 눈금 = 평균
function TravelBar({ max, avg, scale, fairest }: { max: number; avg: number; scale: number; fairest: boolean }) {
  return (
    <View style={styles.travel} accessibilityLabel={`이동시간 최대 ${Math.round(max)}분, 평균 ${Math.round(avg)}분${fairest ? ', 가장 공평' : ''}`}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(max / scale) * 100}%` }, fairest && { backgroundColor: Palette.red }]} />
        <View style={[styles.tick, { left: `${(avg / scale) * 100}%` }]} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.travelText}>
        최대 <ThemedText type="small" style={[styles.num, fairest && { color: Palette.red }]}>{Math.round(max)}</ThemedText>분 · 평균 {Math.round(avg)}분
        {fairest ? <ThemedText type="small" style={{ color: Palette.red }}>  가장 공평</ThemedText> : null}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  header: { gap: Spacing.three, marginBottom: Spacing.two },
  card: { borderRadius: Radius.card, padding: Spacing.threeHalf, gap: Spacing.twoHalf, backgroundColor: Palette.white },
  code: { letterSpacing: 6, fontVariant: ['tabular-nums'] },
  step: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf, minHeight: 52,
    paddingHorizontal: Spacing.three, borderRadius: Radius.control, backgroundColor: Palette.polar,
  },
  stepValue: { flexShrink: 1, maxWidth: '50%', textAlign: 'right' },
  candidate: { borderRadius: Radius.control, padding: Spacing.three, gap: Spacing.twoHalf, backgroundColor: Palette.polar, borderWidth: 1.5, borderColor: 'transparent' },
  candidateOn: { backgroundColor: Palette.glacierSoft, borderColor: Palette.glacier },
  candidateMain: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.twoHalf },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  candName: { fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two, marginTop: 2 },
  wonBadge: { backgroundColor: Palette.red, borderRadius: Radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
  wonText: { color: Palette.white, fontSize: 12, lineHeight: 16 },
  votes: { fontSize: 22, lineHeight: 28, fontWeight: '600', color: Palette.slate, fontVariant: ['tabular-nums'] },
  travel: { marginTop: Spacing.two, gap: Spacing.one },
  track: { height: 6, borderRadius: 3, backgroundColor: Palette.line },
  fill: { height: 6, borderRadius: 3, backgroundColor: Palette.glacier },
  tick: { position: 'absolute', top: -3, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: Palette.ink },
  travelText: { fontVariant: ['tabular-nums'] },
  num: { color: Palette.ink, fontWeight: '600' },
  finalPlace: { gap: Spacing.one },
  finalName: { fontSize: 20, lineHeight: 28, fontWeight: '500' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  voteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: Spacing.twoHalf,
    borderRadius: Radius.chip, backgroundColor: Palette.white, borderWidth: 1, borderColor: Palette.line,
  },
  voteOn: { backgroundColor: Palette.glacier, borderColor: Palette.glacier },
  voteText: { color: Palette.ink, fontWeight: '500' },
  dim: { opacity: 0.4 },
  row: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'center' },
  flex: { flex: 1 },
  link: { padding: Spacing.two },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.one },
  member: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.twoHalf, borderRadius: Radius.control, backgroundColor: Palette.white,
  },
  memberIcon: { marginRight: 2 },
  hint: { textAlign: 'center' },
  footer: { gap: Spacing.three, marginTop: Spacing.three },
  danger: { alignItems: 'center', padding: Spacing.three },
});
