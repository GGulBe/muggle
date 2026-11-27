import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, localDate, SLOT_LABEL, SLOTS, type Slot } from '@/lib/party';
import { supabase } from '@/lib/supabase';

const DAYS = 14; // 오늘부터 2주
const key = (day: string, slot: Slot) => `${day}|${slot}`;

export default function DatesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);

  // 화면을 연 시점 기준으로 한 번만 계산
  const [days] = useState(() => Array.from({ length: DAYS }, (_, i) => localDate(new Date(Date.now() + i * 864e5))));

  useEffect(() => {
    // RLS: 내 가능 날짜만 보인다
    supabase.from('availabilities').select('day, slot').eq('party_id', id)
      .then(({ data }) => setPicked(new Set((data ?? []).map((a) => key(a.day, a.slot)))));
  }, [id]);

  const toggle = (k: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    // 통째로 바꾼다: 내 것 지우고 다시 넣기 (지난 날짜는 화면에 없으니 함께 정리됨)
    const { data: u } = await supabase.auth.getUser();
    const del = await supabase.from('availabilities').delete().eq('party_id', id).eq('user_id', u.user!.id);
    const rows = [...picked].map((k) => {
      const [day, slot] = k.split('|');
      return { party_id: id, day, slot };
    }).filter((r) => days.includes(r.day));
    const ins = rows.length ? await supabase.from('availabilities').insert(rows) : { error: null };
    setSaving(false);
    const error = del.error ?? ins.error;
    if (error) return Alert.alert('저장하지 못했어요', error.message);
    router.back();
  };

  if (!picked) return <ThemedView style={styles.center}><ActivityIndicator /></ThemedView>;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          만날 수 있는 날짜와 시간대를 모두 골라 주세요. 다른 사람에게는 날짜별 가능 인원수만 보여요.
        </ThemedText>
        <View style={styles.row}>
          <View style={styles.dayCol} />
          {SLOTS.map((s) => (
            <ThemedText key={s} type="smallBold" style={styles.slotHead}>{SLOT_LABEL[s]}</ThemedText>
          ))}
        </View>
        {days.map((day) => (
          <View key={day} style={styles.row}>
            <ThemedText style={styles.dayCol}>{formatDay(day)}</ThemedText>
            {SLOTS.map((slot) => {
              const on = picked.has(key(day, slot));
              return (
                <Pressable
                  key={slot}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${formatDay(day)} ${SLOT_LABEL[slot]}`}
                  onPress={() => toggle(key(day, slot))}
                  style={[styles.cell, { borderColor: on ? '#208AEF' : theme.backgroundSelected, backgroundColor: on ? '#208AEF' : 'transparent' }]}>
                  <ThemedText type="small" style={{ color: on ? '#fff' : theme.textSecondary }}>{on ? '가능' : ''}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <Button title={`저장 (${picked.size}개 선택)`} onPress={save} busy={saving} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dayCol: { width: 92 },
  slotHead: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  panel: { padding: Spacing.three },
});
