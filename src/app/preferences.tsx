import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ban, Heart } from 'lucide-react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Neo, Palette, Radius, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Kind = 'like' | 'dislike';
type TargetType = 'category' | 'region';
const k = (t: TargetType, target: string) => `${t}|${target}`;
const NEXT: Record<'none' | Kind, 'none' | Kind> = { none: 'like', like: 'dislike', dislike: 'none' };

// 취향은 파티가 아니라 사람 단위. 본인 외 누구도 볼 수 없다 (RLS). 추천 함수만 읽는다
export default function PreferencesScreen() {
  const [categories, setCategories] = useState<string[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [prefs, setPrefs] = useState<Map<string, Kind> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('categories').select('name'),
      supabase.from('stations').select('id, name').eq('is_hotspot', true).order('name'),
      supabase.from('preferences').select('kind, target_type, target'),
    ]).then(([c, s, p]) => {
      setCategories((c.data ?? []).map((r) => r.name));
      setRegions(s.data ?? []);
      setPrefs(new Map((p.data ?? []).map((r) => [k(r.target_type, r.target), r.kind])));
    });
  }, []);

  const cycle = (key: string) =>
    setPrefs((prev) => {
      const next = new Map(prev);
      const v = NEXT[prev?.get(key) ?? 'none'];
      if (v === 'none') next.delete(key);
      else next.set(key, v);
      return next;
    });

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const del = await supabase.from('preferences').delete().eq('user_id', u.user!.id);
    const rows = [...prefs].map(([key, kind]) => {
      const [target_type, target] = key.split('|');
      return { kind, target_type, target };
    });
    const ins = rows.length ? await supabase.from('preferences').insert(rows) : { error: null };
    setSaving(false);
    const error = del.error ?? ins.error;
    if (error) return Alert.alert('저장하지 못했어요', error.message);
    router.back();
  };

  const chip = (key: string, label: string) => {
    const v = prefs?.get(key);
        return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${v === 'like' ? '좋아요' : v === 'dislike' ? '싫어요' : '상관없음'}`}
        onPress={() => cycle(key)}
        style={({ pressed }) => [
          styles.chip,
          v === 'like' ? Neo.on : v === 'dislike' ? styles.dislike : Neo.off,
          pressed && Neo.pressedSm,
        ]}>
        {v === 'like' && <Heart size={16} strokeWidth={2.5} color={Palette.ink} fill={Palette.white} />}
        {v === 'dislike' && <Ban size={16} strokeWidth={2.5} color={Palette.white} />}
        <ThemedText type="small" style={[{ fontWeight: '700' }, v === 'dislike' && { color: Palette.white }]}>{label}</ThemedText>
      </Pressable>
    );
  };

  if (!prefs) return <ThemedView style={styles.center}><ActivityIndicator /></ThemedView>;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <ThemedText type="smallBold">나만 볼 수 있어요</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            누구에게도 공개되지 않고, 추천 계산에만 쓰여요. 한 번 누르면 좋아요, 두 번 누르면 싫어요예요. 싫어요를 고른 곳은 추천에서 빠져요.
          </ThemedText>
        </View>
        <ThemedText type="smallBold">음식</ThemedText>
        <View style={styles.chips}>{categories.map((c) => chip(k('category', c), c))}</View>
        <ThemedText type="smallBold">동네</ThemedText>
        <View style={styles.chips}>{regions.map((r) => chip(k('region', r.id), r.name))}</View>
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <Button title="저장" onPress={save} busy={saving} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three },
  notice: { ...Neo.box, ...Neo.shadow, backgroundColor: Palette.glacier, padding: Spacing.three, gap: 4, marginRight: 4 },
  dislike: { borderWidth: 2, borderColor: Palette.ink, backgroundColor: Palette.red, boxShadow: `2px 2px 0px ${Palette.ink}` },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.chip, paddingHorizontal: Spacing.twoHalf, paddingVertical: Spacing.two },
  panel: { padding: Spacing.three },
});
