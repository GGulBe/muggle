import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Station } from '@/components/station';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Neo, Palette, Radius, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Place = {
  name: string;
  category: string;
  lat: number;
  lng: number;
  is_dummy: boolean;
  stations: { name: string } | null;
};
type Review = { rating: number; menu: string | null; body: string | null; profiles: { nickname: string } | null };

// 투표 중 가게 정보. 사진·영업시간·메뉴판은 카카오맵 장소 페이지로 넘긴다 (카카오 공식 API는 사진을 주지 않음)
export default function PlaceScreen() {
  // 파티 화면이 보낸 값: 파티 id, 가게 id, 투표 라운드, 지금 투표할 수 있는지, 이동시간(장소 미정 모드만)
  const { id, place, round, canVote, max, avg } = useLocalSearchParams<{
    id: string; place: string; round: string; canVote?: string; max?: string; avg?: string;
  }>();
  const [info, setInfo] = useState<Place | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: r }, { data: v }] = await Promise.all([
        supabase.from('places').select('name, category, lat, lng, is_dummy, stations(name)').eq('id', Number(place)).single(),
        supabase.from('reviews').select('rating, menu, body, profiles(nickname)').eq('place_id', Number(place)).order('created_at', { ascending: false }),
        // RLS: 내 표만 보인다
        supabase.from('votes').select('place_id').eq('party_id', id).eq('round', Number(round)).eq('place_id', Number(place)),
      ]);
      setInfo(p as Place | null);
      setReviews((r as Review[] | null) ?? []);
      setVoted((v ?? []).length > 0);
    })();
  }, [id, place, round]);

  if (!info) return <ThemedView style={styles.center}><ActivityIndicator /></ThemedView>;

  const station = info.stations?.name ?? '';
  const stationQ = station.endsWith('역') ? station : `${station}역`; // '서울역역' 방지
  // 실제 가게는 이름으로, 더미 가게는 '동네 + 종류'로 카카오맵 검색 (진짜 주변 가게가 나온다)
  const query = info.is_dummy ? `${stationQ} ${info.category}` : `${info.name} ${station}`;
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const menus = [...new Set(reviews.flatMap((r) => (r.menu ?? '').split(',').map((m) => m.trim()).filter(Boolean)))];

  const toggleVote = async () => {
    setBusy(true);
    const { error } = voted
      ? await supabase.from('votes').delete().match({ party_id: id, round: Number(round), place_id: Number(place) }) // RLS: 내 표만 지워진다
      : await supabase.from('votes').insert({ party_id: id, round: Number(round), place_id: Number(place) });
    setBusy(false);
    if (error) return Alert.alert('투표하지 못했어요', error.message);
    setVoted(!voted);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: info.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300)} style={styles.card}>
          <ThemedText type="subtitle" style={styles.name}>{info.name}</ThemedText>
          <View style={styles.meta}>
            <ThemedText themeColor="textSecondary">{info.category}</ThemedText>
            {station ? <Station name={station} size="default" /> : null}
          </View>
          {max && avg && <ThemedText type="small">멤버 이동시간 최대 {max}분 · 평균 {avg}분</ThemedText>}
          <ThemedText type="small">
            {reviews.length ? (
              <>
                <ThemedText type="small" style={styles.gold}>★</ThemedText> {avgRating.toFixed(1)} · muggle 후기 {reviews.length}개
              </>
            ) : 'muggle 후기가 아직 없어요'}
          </ThemedText>
          {info.is_dummy && (
            <ThemedText type="small" themeColor="textSecondary">시연용 가게예요. 카카오맵에서는 {stationQ} 주변 {info.category} 가게를 보여줘요.</ThemedText>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(300)} style={styles.row}>
          <Button title="카카오맵에서 보기" variant="secondary" style={styles.flex}
            onPress={() => Linking.openURL(`https://map.kakao.com/link/search/${encodeURIComponent(query)}`)} />
          <Button title="길찾기" variant="secondary" style={styles.flex}
            onPress={() => Linking.openURL(`https://map.kakao.com/link/to/${encodeURIComponent(info.name)},${info.lat},${info.lng}`)} />
        </Animated.View>
        <ThemedText type="small" themeColor="textSecondary">사진·메뉴판·영업시간은 카카오맵에서 볼 수 있어요</ThemedText>

        {menus.length > 0 && (
          <Animated.View entering={FadeInDown.delay(160).duration(300)} style={styles.section}>
            <ThemedText type="smallBold">다녀온 사람들이 먹은 메뉴</ThemedText>
            <View style={styles.chips}>
              {menus.map((m) => (
                <View key={m} style={styles.chip}>
                  <ThemedText type="small">{m}</ThemedText>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {reviews.length > 0 && <ThemedText type="smallBold">후기</ThemedText>}
        {reviews.slice(0, 10).map((r, i) => (
          <Animated.View key={i} entering={FadeInDown.delay(200 + i * 40).duration(250)} style={styles.review}>
            <ThemedText type="small">
              <ThemedText type="smallBold">{r.profiles?.nickname || '익명'}</ThemedText>
              <ThemedText type="small" style={styles.gold}>  {'★'.repeat(r.rating)}</ThemedText>
            </ThemedText>
            {r.body && <ThemedText type="small">{r.body}</ThemedText>}
          </Animated.View>
        ))}
      </ScrollView>
      {canVote === '1' && (
        <SafeAreaView edges={['bottom']} style={styles.panel}>
          <Button title={voted ? '투표 취소' : '여기에 투표'} variant={voted ? 'secondary' : 'primary'} onPress={toggleVote} busy={busy} />
        </SafeAreaView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three },
  card: { ...Neo.box, ...Neo.shadow, backgroundColor: Palette.glacier, padding: Spacing.threeHalf, gap: Spacing.one, marginRight: 4 },
  name: { fontSize: 26, lineHeight: 34 },
  row: { flexDirection: 'row', gap: Spacing.two },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf },
  flex: { flex: 1 },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { ...Neo.off, borderRadius: Radius.chip, paddingHorizontal: Spacing.twoHalf, paddingVertical: 6 },
  review: { ...Neo.box, ...Neo.shadowSm, padding: Spacing.three, gap: 4, backgroundColor: Palette.white, marginRight: 2 },
  gold: { color: Palette.slate },
  panel: { padding: Spacing.three },
});
