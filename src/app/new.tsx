import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Neo, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Mode = 'none' | 'region' | 'place';
type Station = { id: string; name: string };
type Place = {
  id: number;
  name: string;
  category: string;
  stations: { name: string } | null;
};

const MODES: { mode: Mode; title: string; body: string }[] = [
  {
    mode: 'none',
    title: '아직 몰라요',
    body: '모두의 출발지로 공평한 장소를 추천받아요',
  },
  {
    mode: 'region',
    title: '동네는 정했어요',
    body: '그 동네 안에서 먹을 곳만 추천받아요',
  },
  {
    mode: 'place',
    title: '장소까지 정했어요',
    body: '날짜·시간만 맞춰요 (투표 없음)',
  },
];
const RADII = [0.5, 1, 1.5, 2, 3, 5, 7, 10]; // km, DB 제약 0.3~10

export default function NewPartyScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('none');
  const [query, setQuery] = useState('');
  const [stations, setStations] = useState<Station[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [radius, setRadius] = useState(1);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0); // 늦게 도착한 이전 검색 결과는 버린다
  const scroll = useRef<ScrollViewInstance>(null);
  const inputY = useRef(0);
  const [typing, setTyping] = useState(false);

  const search = async (text: string, m: Mode = mode) => {
    setQuery(text);
    const q = text.replace(/[%_,()*\\]/g, '').trim(); // ilike·or 필터 문법 문자 제거
    const n = ++latest.current;
    if (!q) {
      setStations([]);
      setPlaces([]);
      return;
    }
    const { data: st } = await supabase.from('stations').select('id, name').ilike('name', `%${q}%`).order('name').limit(8);
    if (m === 'place') {
      // 이름·종류, 또는 동네 이름으로 찾기
      const ids = (st ?? []).map((s) => s.id).join(',');
      const { data } = await supabase
        .from('places')
        .select('id, name, category, stations(name)')
        .or(`name.ilike.%${q}%,category.ilike.%${q}%${ids ? `,station_id.in.(${ids})` : ''}`)
        .order('name')
        .limit(20);
      if (n === latest.current) setPlaces((data as Place[] | null) ?? []);
    } else if (n === latest.current) {
      setStations(st ?? []);
    }
  };

  const pickMode = (m: Mode) => {
    setMode(m);
    setStation(null);
    setPlace(null);
    search('', m);
  };

  const ready = mode === 'none' || (mode === 'region' && station) || (mode === 'place' && place);

  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_party', {
      p_fixed_mode: mode,
      p_fixed_station_id: mode === 'region' ? station?.id : null,
      p_fixed_place_id: mode === 'place' ? place?.id : null,
      p_fixed_radius_km: radius,
    });
    setBusy(false);
    if (error) return Alert.alert('파티를 만들지 못했어요', error.message);
    router.replace({
      pathname: '/party/[id]',
      params: { id: data.id, welcome: 'created' },
    });
  };

  const chip = (selected: boolean) => [
    styles.chip,
    {
      ...(selected ? Neo.on : Neo.off),
    },
  ];

  const picked =
    mode === 'region' ? station?.name : mode === 'place' && place ? `${place.name} · ${place.stations?.name ?? ''}` : null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.content, typing && styles.typing]}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="smallBold">어디서 만날지 정했나요?</ThemedText>
        {MODES.map((m) => (
          <Pressable
            key={m.mode}
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === m.mode }}
            onPress={() => pickMode(m.mode)}
            style={[styles.card, ...chip(mode === m.mode).slice(1)]}>
            <ThemedText style={{ fontWeight: '800' }}>{m.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {m.body}
            </ThemedText>
          </Pressable>
        ))}

        {mode !== 'none' &&
          (picked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${picked} 선택 취소`}
              onPress={() => (mode === 'region' ? setStation(null) : setPlace(null))}
              style={[styles.card, ...chip(true).slice(1), styles.pickedRow]}>
              <ThemedText>{picked}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                바꾸기 ✕
              </ThemedText>
            </Pressable>
          ) : (
            <>
              <TextInput
                value={query}
                onChangeText={(t) => search(t)}
                placeholder={mode === 'region' ? '동네·역 이름 검색 (예: 성수)' : '식당 이름·종류·동네 검색'}
                placeholderTextColor={theme.textSecondary}
                autoCorrect={false}
                // 키보드에 결과가 가리지 않게: 아래 여백을 두고 검색창을 맨 위로 올린다
                onLayout={(e) => (inputY.current = e.nativeEvent.layout.y)}
                onFocus={() => {
                  setTyping(true);
                  setTimeout(
                    () =>
                      scroll.current?.scrollTo({
                        y: inputY.current - Spacing.three,
                      }),
                    100,
                  );
                }}
                onBlur={() => setTyping(false)}
                accessibilityLabel={mode === 'region' ? '동네 검색' : '장소 검색'}
                style={[styles.input, { color: theme.text }]}
              />
              {mode === 'region' &&
                stations.map((s) => (
                  <Animated.View key={s.id} entering={FadeIn.duration(200)}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setStation(s)}
                      style={styles.row}>
                      <ThemedText>{s.name}</ThemedText>
                    </Pressable>
                  </Animated.View>
                ))}
              {mode === 'place' &&
                places.map((p) => (
                  <Animated.View key={p.id} entering={FadeIn.duration(200)}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setPlace(p)}
                      style={styles.row}>
                      <ThemedText>{p.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {p.category} · {p.stations?.name}
                      </ThemedText>
                    </Pressable>
                  </Animated.View>
                ))}
              {query.trim() !== '' && (mode === 'region' ? stations : places).length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  검색 결과가 없어요
                </ThemedText>
              )}
            </>
          ))}

        {mode === 'region' && (
          <>
            <ThemedText type="smallBold">범위 · 반경 {radius}km</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {RADII.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: radius === r }}
                  onPress={() => setRadius(r)}
                  style={chip(radius === r)}>
                  <ThemedText type="small">{r}km</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        <Button title="파티 만들기" onPress={create} disabled={!ready} busy={busy} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  typing: { paddingBottom: 600 },
  card: { borderRadius: Radius.card, padding: Spacing.three, gap: 2 },
  pickedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: { height: 48, ...Neo.input, paddingHorizontal: Spacing.three, fontSize: 16, fontWeight: '600' },
  row: { borderBottomWidth: 2, borderColor: Palette.ink, paddingVertical: Spacing.twoHalf, gap: 2 },
  chips: { gap: Spacing.two },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.two,
  },
});
