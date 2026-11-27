import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { Check } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Review = {
  user_id: string;
  party_id: string | null;
  rating: number;
  menu: string | null;
  body: string | null;
  created_at: string;
  profiles: { nickname: string } | null;
};

const splitMenu = (m: string | null) => (m ?? '').split(',').map((x) => x.trim()).filter(Boolean);

// 약속 후 후기: 별점 + 먹은 메뉴 체크 + 한 줄 후기. 앱 사용자만 볼 수 있다
export default function ReviewScreen() {
  // 파티 화면이 보낸 값: 파티 id, 확정 장소 id·이름
  const { id, place, name } = useLocalSearchParams<{ id: string; place: string; name?: string }>();
  const theme = useTheme();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [menus, setMenus] = useState<string[]>([]);
  const [newMenu, setNewMenu] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [typing, setTyping] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const ys = useRef({ menu: 0, body: 0 }); // 키보드에 가리지 않게 올릴 위치

  useEffect(() => {
    (async () => {
      const [{ data: u }, { data }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('reviews')
          .select('user_id, party_id, rating, menu, body, created_at, profiles(nickname)')
          .eq('place_id', Number(place))
          .order('created_at', { ascending: false }),
      ]);
      const list = (data as Review[] | null) ?? [];
      const uid = u.user?.id ?? null;
      const mine = list.find((r) => r.user_id === uid && r.party_id === id);
      if (mine) {
        setRating(mine.rating);
        setMenus(splitMenu(mine.menu));
        setBody(mine.body ?? '');
      }
      setMe(uid);
      setReviews(list);
    })();
  }, [id, place]);

  if (!reviews) return <ThemedView style={styles.center}><ActivityIndicator /></ThemedView>;

  const others = reviews.filter((r) => !(r.user_id === me && r.party_id === id));
  // 다른 사람들이 먹은 메뉴를 체크 목록으로 (많이 먹은 순)
  const freq = new Map<string, number>();
  for (const r of reviews) for (const m of splitMenu(r.menu)) freq.set(m, (freq.get(m) ?? 0) + 1);
  const choices = [...new Set([...[...freq].sort((a, b) => b[1] - a[1]).map(([m]) => m), ...menus])];
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const toggleMenu = (m: string) => setMenus((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]));
  const addMenu = () => {
    const m = newMenu.replace(/,/g, ' ').trim().slice(0, 20);
    if (m && !menus.includes(m)) setMenus([...menus, m]);
    setNewMenu('');
  };

  const save = async () => {
    setSaving(true);
    // 수정 = 내 후기를 지우고 다시 쓰기 (파티당 1개)
    const del = await supabase.from('reviews').delete().eq('party_id', id).eq('user_id', me!);
    const ins = await supabase.from('reviews').insert({
      place_id: Number(place),
      party_id: id,
      rating,
      menu: menus.join(', ') || null,
      body: body.trim() || null,
    });
    setSaving(false);
    const error = del.error ?? ins.error;
    if (error) return Alert.alert('저장하지 못했어요', error.message);
    router.back();
  };

  const chip = (on: boolean) => [
    styles.chip,
    { borderColor: on ? Palette.glacier : Palette.line, backgroundColor: on ? Palette.glacierSoft : Palette.white },
  ];
  const focusInput = (k: 'menu' | 'body') => {
    setTyping(true);
    setTimeout(() => scroll.current?.scrollTo({ y: ys.current[k] - Spacing.six }), 100);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: name ? `후기 · ${name}` : '후기' }} />
      <ScrollView ref={scroll} contentContainerStyle={[styles.content, typing && styles.typing]} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          {reviews.length ? `평균 ${avg.toFixed(1)}점 · 후기 ${reviews.length}개` : '첫 후기를 남겨 주세요'} · 앱 사용자만 볼 수 있어요
        </ThemedText>

        <ThemedText type="smallBold">별점</ThemedText>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: rating === n }} accessibilityLabel={`${n}점`}
              onPress={() => setRating(n)} hitSlop={6}>
              {/* 고를 때마다 별이 튀어 오르게 key로 다시 마운트 */}
              <Animated.View key={`${n}-${rating >= n}`} entering={rating >= n ? FadeIn.duration(160) : undefined}>
                <ThemedText style={[styles.star, { color: rating >= n ? Palette.red : Palette.line }]}>★</ThemedText>
              </Animated.View>
            </Pressable>
          ))}
        </View>

        <ThemedText type="smallBold">먹은 메뉴</ThemedText>
        <View style={styles.chips}>
          {choices.map((m) => (
            <Animated.View key={m} entering={FadeIn.duration(200)}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: menus.includes(m) }} onPress={() => toggleMenu(m)} style={chip(menus.includes(m))}>
                {menus.includes(m) && <Check size={16} strokeWidth={2} color={Palette.ink} />}
                <ThemedText type="small">{m}</ThemedText>
              </Pressable>
            </Animated.View>
          ))}
        </View>
        <View style={styles.addRow} onLayout={(e) => (ys.current.menu = e.nativeEvent.layout.y)}>
          <TextInput
            value={newMenu}
            onChangeText={setNewMenu}
            onSubmitEditing={addMenu}
            onFocus={() => focusInput('menu')}
            onBlur={() => setTyping(false)}
            placeholder="다른 메뉴 추가 (예: 삼겹살)"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            accessibilityLabel="먹은 메뉴 추가"
            style={[styles.input, styles.flex, { color: theme.text }]}
          />
          <Button title="추가" variant="secondary" onPress={addMenu} disabled={!newMenu.trim()} />
        </View>

        <ThemedText type="smallBold">한 줄 후기 (선택)</ThemedText>
        <TextInput
          value={body}
          onChangeText={setBody}
          onFocus={() => focusInput('body')}
          onLayout={(e) => (ys.current.body = e.nativeEvent.layout.y)}
          onBlur={() => setTyping(false)}
          placeholder="맛, 분위기, 다음에 또 올지…"
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={200}
          accessibilityLabel="한 줄 후기"
          style={[styles.input, styles.body, { color: theme.text }]}
        />

        {others.length > 0 && <ThemedText type="smallBold">다른 사람들의 후기</ThemedText>}
        {others.map((r, i) => (
          <Animated.View key={`${r.user_id}-${r.created_at}`} entering={FadeInDown.delay(i * 40).duration(250)}
            style={styles.review}>
            <ThemedText type="small">
              <ThemedText type="smallBold">{r.profiles?.nickname || '익명'}</ThemedText>
              <ThemedText type="small" style={styles.gold}>  {'★'.repeat(r.rating)}</ThemedText>
            </ThemedText>
            {r.menu && <ThemedText type="small" themeColor="textSecondary">{r.menu}</ThemedText>}
            {r.body && <ThemedText type="small">{r.body}</ThemedText>}
          </Animated.View>
        ))}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <Button title={rating ? '후기 저장' : '별점을 골라 주세요'} onPress={save} disabled={!rating} busy={saving} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three },
  typing: { paddingBottom: 500 },
  stars: { flexDirection: 'row', gap: Spacing.two },
  star: { fontSize: 40, lineHeight: 48 },
  gold: { color: Palette.slate },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: Radius.chip, paddingHorizontal: Spacing.twoHalf, paddingVertical: Spacing.two },
  addRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  input: { height: 48, borderWidth: 1, borderColor: Palette.line, borderRadius: Radius.control, backgroundColor: Palette.white, paddingHorizontal: Spacing.three, fontSize: 16 },
  body: { height: 96, paddingTop: 12, textAlignVertical: 'top' },
  review: { borderRadius: Radius.control, padding: Spacing.three, gap: 4, backgroundColor: Palette.white },
  flex: { flex: 1 },
  panel: { padding: Spacing.three },
});
