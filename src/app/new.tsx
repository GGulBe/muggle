import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Mode = 'none' | 'region' | 'place';
type Station = { id: string; name: string };
type Place = { id: number; name: string; category: string };

const MODES: { mode: Mode; title: string; body: string }[] = [
  { mode: 'none', title: '아직 몰라요', body: '모두의 출발지로 공평한 장소를 추천받아요' },
  { mode: 'region', title: '동네는 정했어요', body: '그 동네 안에서 먹을 곳만 추천받아요' },
  { mode: 'place', title: '장소까지 정했어요', body: '날짜·시간만 맞춰요 (투표 없음)' },
];

export default function NewPartyScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('none');
  const [stations, setStations] = useState<Station[]>([]);
  const [station, setStation] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [place, setPlace] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('stations').select('id, name').eq('is_hotspot', true).order('name')
      .then(({ data }) => setStations(data ?? []));
  }, []);

  // 동네를 고르면 그 동네 식당 목록을 불러온다 (장소 고정용)
  const pickStation = (sid: string) => {
    setStation(sid);
    setPlace(null);
    setPlaces([]);
    supabase.from('places').select('id, name, category').eq('station_id', sid).order('name')
      .then(({ data }) => setPlaces(data ?? []));
  };

  const ready = mode === 'none' || (mode === 'region' && station) || (mode === 'place' && place);

  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_party', {
      p_fixed_mode: mode,
      p_fixed_station_id: mode === 'region' ? station : null,
      p_fixed_place_id: mode === 'place' ? place : null,
    });
    setBusy(false);
    if (error) return Alert.alert('파티를 만들지 못했어요', error.message);
    router.replace(`/party/${data.id}`);
  };

  const chip = (selected: boolean) => [
    styles.chip,
    { borderColor: selected ? '#208AEF' : theme.backgroundSelected, backgroundColor: selected ? '#208AEF22' : 'transparent' },
  ];

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="smallBold">어디서 만날지 정했나요?</ThemedText>
        {MODES.map((m) => (
          <Pressable
            key={m.mode}
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === m.mode }}
            onPress={() => setMode(m.mode)}
            style={[styles.card, ...chip(mode === m.mode).slice(1)]}>
            <ThemedText>{m.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{m.body}</ThemedText>
          </Pressable>
        ))}

        {mode !== 'none' && (
          <>
            <ThemedText type="smallBold">동네</ThemedText>
            <View style={styles.chips}>
              {stations.map((s) => (
                <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected: station === s.id }}
                  onPress={() => pickStation(s.id)} style={chip(station === s.id)}>
                  <ThemedText type="small">{s.name}</ThemedText>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {mode === 'place' && station && (
          <>
            <ThemedText type="smallBold">장소</ThemedText>
            {places.map((p) => (
              <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ selected: place === p.id }}
                onPress={() => setPlace(p.id)} style={[styles.card, ...chip(place === p.id).slice(1)]}>
                <ThemedText>{p.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{p.category}</ThemedText>
              </Pressable>
            ))}
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
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
});
