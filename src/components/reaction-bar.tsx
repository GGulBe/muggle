import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SmilePlus } from 'lucide-react-native';
import Animated, { FadeIn, FadeInUp, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Neo, Palette, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { firstEmoji, type Reaction } from '@/lib/party';

type Props = {
  reactions: Reaction[]; // 이 후보에 달린 반응
  me: string | null;
  onToggle: (emoji: string) => void;
};

// 채팅처럼 아무 이모지나 남기는 반응 바. 같은 이모지를 누르면 +1, 다시 누르면 취소
export function ReactionBar({ reactions, me, onToggle }: Props) {
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  // 처음 달린 순서대로 묶어서 센다
  const groups = new Map<string, { n: number; mine: boolean }>();
  for (const r of reactions) {
    const g = groups.get(r.emoji) ?? { n: 0, mine: false };
    groups.set(r.emoji, { n: g.n + 1, mine: g.mine || r.user_id === me });
  }

  const submit = (text: string) => {
    setDraft(text);
    const e = firstEmoji(text.replace(/[\p{L}\p{N}\p{P}\s]/gu, '')); // 글자는 건너뛰고 이모지만
    if (!e) return;
    setDraft('');
    setAdding(false);
    if (!groups.get(e)?.mine) onToggle(e);
  };

  const close = () => {
    setAdding(false);
    setDraft('');
  };

  const chip = (on: boolean) => [
    styles.chip,
    on ? Neo.on : Neo.off,
  ];

  return (
    <Animated.View layout={LinearTransition} style={styles.row}>
      {[...groups].map(([emoji, g]) => (
        <Animated.View key={emoji} entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} layout={LinearTransition}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${emoji} 반응 ${g.n}개${g.mine ? ', 내가 누름' : ''}`}
            onPress={() => onToggle(emoji)}
            style={({ pressed }) => [...chip(g.mine), pressed && styles.pressed]}>
            <ThemedText type="small">{emoji}</ThemedText>
            {/* 숫자가 바뀔 때마다 살짝 튀어 오르게 key로 다시 마운트 */}
            <Animated.View key={g.n} entering={FadeInUp.duration(160)}>
              <ThemedText type="small" style={g.mine && styles.mineCount}>{g.n}</ThemedText>
            </Animated.View>
          </Pressable>
        </Animated.View>
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="이모지 반응 추가"
        onPress={() => setAdding(true)}
        style={({ pressed }) => [...chip(false), pressed && styles.pressed]}>
        <SmilePlus size={18} strokeWidth={2.5} color={Palette.ink} />
      </Pressable>

      {/* 키보드에 가리지 않게 화면 위쪽에 띄우는 입력창. 키보드의 이모지 탭에서 아무거나 고르면 바로 반응 */}
      <Modal visible={adding} transparent animationType="fade" onRequestClose={close} onShow={() => {
        setTimeout(() => input.current?.focus(), 100);
      }} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="닫기">
          <Animated.View entering={FadeInUp.duration(220)} style={styles.sheet}>
            <Pressable>
              <ThemedText type="smallBold">어떤 이모지로 반응할까요?</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">키보드의 이모지 버튼을 눌러 아무거나 골라 주세요</ThemedText>
              <View style={styles.inputRow}>
                <TextInput
                  ref={input}
                  value={draft}
                  onChangeText={submit}
                  placeholder="이모지"
                  placeholderTextColor={theme.muted}
                  accessibilityLabel="반응할 이모지 입력"
                  style={[styles.input, { color: theme.text }]}
                />
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.chip, paddingHorizontal: 10, minHeight: 32 },
  pressed: { transform: [{ scale: 0.96 }] },
  mineCount: { color: Palette.ink, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(29,42,51,0.4)', paddingTop: 120, paddingHorizontal: 24 },
  sheet: { ...Neo.box, ...Neo.shadow, padding: 20, backgroundColor: Palette.white },
  inputRow: { marginTop: 12 },
  input: { height: 56, ...Neo.input, paddingHorizontal: 16, fontSize: 28, textAlign: 'center' },
});
