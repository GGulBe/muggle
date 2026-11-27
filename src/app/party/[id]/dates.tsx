import { router, Stack, useLocalSearchParams } from 'expo-router';
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

const MONTHS = 3; // 이번 달부터 3개월
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const BLUE = '#208AEF';
const key = (day: string, slot: Slot) => `${day}|${slot}`;

// 해당 달의 달력 칸: 앞쪽 빈칸(null) + 1일~말일
const monthCells = (y: number, m: number) => {
  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  return [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: last }, (_, i) => localDate(new Date(y, m, i + 1))),
  ];
};

export default function DatesScreen() {
  const { id, code } = useLocalSearchParams<{ id: string; code?: string }>(); // 파티 화면이 보낸 값
  const theme = useTheme();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [today] = useState(() => localDate(new Date())); // 화면을 연 시점 기준
  const [month, setMonth] = useState(0); // 이번 달로부터 몇 달 뒤
  const [focus, setFocus] = useState(today);

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

  // 그날 세 시간대를 한 번에 켜고 끈다
  const toggleAllDay = (day: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const all = SLOTS.every((s) => next.has(key(day, s)));
      for (const s of SLOTS) {
        if (all) next.delete(key(day, s));
        else next.add(key(day, s));
      }
      return next;
    });

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    // 통째로 바꾼다: 내 것 지우고 다시 넣기 (지난 날짜는 함께 정리됨)
    const { data: u } = await supabase.auth.getUser();
    const del = await supabase.from('availabilities').delete().eq('party_id', id).eq('user_id', u.user!.id);
    const rows = [...picked].map((k) => {
      const [day, slot] = k.split('|');
      return { party_id: id, day, slot };
    }).filter((r) => r.day >= today);
    const ins = rows.length ? await supabase.from('availabilities').insert(rows) : { error: null };
    setSaving(false);
    const error = del.error ?? ins.error;
    if (error) return Alert.alert('저장하지 못했어요', error.message);
    router.back();
  };

  if (!picked) return <ThemedView style={styles.center}><ActivityIndicator /></ThemedView>;

  const [ty, tm] = today.split('-').map(Number);
  const shown = new Date(ty, tm - 1 + month, 1);
  const cells = monthCells(shown.getFullYear(), shown.getMonth());
  const count = [...picked].filter((k) => k >= today).length;

  return (
    <ThemedView style={styles.container}>
      {code && <Stack.Screen options={{ title: `가능한 날짜 · ${code}` }} />}
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          날짜를 누르고 아래에서 가능한 시간대를 골라 주세요. 다른 사람에게는 내 선택이 보이지 않아요.
        </ThemedText>

        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 달" disabled={month === 0}
            onPress={() => setMonth(month - 1)} style={[styles.nav, { opacity: month === 0 ? 0.3 : 1 }]}>
            <ThemedText type="subtitle">‹</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">{shown.getFullYear()}년 {shown.getMonth() + 1}월</ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 달" disabled={month === MONTHS - 1}
            onPress={() => setMonth(month + 1)} style={[styles.nav, { opacity: month === MONTHS - 1 ? 0.3 : 1 }]}>
            <ThemedText type="subtitle">›</ThemedText>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {WEEK.map((w, i) => (
            <ThemedText key={w} type="small" style={[styles.cell, styles.weekHead, i === 0 && styles.sun]}>{w}</ThemedText>
          ))}
          {cells.map((day, i) => {
            if (!day) return <View key={`b${i}`} style={styles.cell} />;
            const past = day < today;
            const on = SLOTS.filter((s) => picked.has(key(day, s)));
            const focused = day === focus;
            return (
              <Pressable
                key={day}
                disabled={past}
                accessibilityRole="button"
                accessibilityState={{ selected: focused, disabled: past }}
                accessibilityLabel={`${formatDay(day)}${on.length ? `, ${on.map((s) => SLOT_LABEL[s]).join('·')} 가능` : ''}`}
                onPress={() => setFocus(day)}
                style={[styles.cell, styles.day, focused && { borderColor: BLUE, borderWidth: 2 }, on.length > 0 && { backgroundColor: '#208AEF22' }]}>
                <ThemedText type="small" style={[past && { opacity: 0.3 }, i % 7 === 0 && styles.sun]}>
                  {Number(day.slice(8))}
                </ThemedText>
                <View style={styles.dots}>
                  {SLOTS.map((s) => (
                    <View key={s} style={[styles.dot, { backgroundColor: picked.has(key(day, s)) ? BLUE : 'transparent' }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.cardHead}>
            <ThemedText type="smallBold">{formatDay(focus)}</ThemedText>
            <Pressable accessibilityRole="button" onPress={() => toggleAllDay(focus)}>
              <ThemedText type="small" style={{ color: BLUE }}>
                {SLOTS.every((s) => picked.has(key(focus, s))) ? '모두 해제' : '하루 종일 가능'}
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.slots}>
            {SLOTS.map((slot) => {
              const on = picked.has(key(focus, slot));
              return (
                <Pressable
                  key={slot}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${formatDay(focus)} ${SLOT_LABEL[slot]}`}
                  onPress={() => toggle(key(focus, slot))}
                  style={[styles.slot, { borderColor: on ? BLUE : theme.backgroundSelected, backgroundColor: on ? BLUE : 'transparent' }]}>
                  <ThemedText style={{ color: on ? '#fff' : theme.text }}>{SLOT_LABEL[slot]}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <Button title={`저장 (${count}개 선택)`} onPress={save} busy={saving} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.three, gap: Spacing.three },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { paddingHorizontal: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center' },
  weekHead: { textAlign: 'center', paddingBottom: Spacing.one },
  sun: { color: '#d93025' },
  day: { height: 52, justifyContent: 'center', gap: 4, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slots: { flexDirection: 'row', gap: Spacing.two },
  slot: { flex: 1, height: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  panel: { padding: Spacing.three },
});
