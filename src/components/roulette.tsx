import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';

type Props = {
  items: { id: number; label: string }[]; // 동점 후보
  winner: number; // 서버가 무작위로 고른 결과 (모든 기기에서 같다)
  playKey: string; // 이 값마다 한 번만 돌린다 (파티·라운드·결과)
  onDone?: (playKey: string) => void; // 멈췄을 때 (이미 본 결과면 바로)
};

const SIZE = 260;
const R = SIZE / 2;
const SPIN_MS = 4000;
// 빙하색 계열과 흰색을 번갈아 (글자는 잉크색). 빨강은 화살표와 결과에만
const COLORS = ['#9CC6E0', '#FFFFFF', '#C9E0EE', '#E3EEF5', '#7FB3D3', '#F1F3F4', '#B3D4E8', '#DCE2E6'];

// 위쪽(12시)에서 시계 방향 각도 → 원 위의 점
const point = (deg: number, r = R) => {
  const t = (deg * Math.PI) / 180;
  return `${R + r * Math.sin(t)} ${R - r * Math.cos(t)}`;
};

// 동점일 때 결과를 보여주는 룰렛. 결과는 서버가 정하고, 이 화면은 그 칸에 멈추도록 돌기만 한다
export function Roulette({ items, winner, playKey, onDone }: Props) {
  const rotation = useSharedValue(0);
  const [done, setDone] = useState(false);
  const seg = 360 / items.length;
  const center = (items.findIndex((x) => x.id === winner) + 0.5) * seg;

  useEffect(() => {
    let alive = true;
    const key = `roulette:${playKey}`;
    (async () => {
      const seen = await AsyncStorage.getItem(key).catch(() => null);
      // 이미 본 결과면 멈춘 상태로, 처음이면 5바퀴 넘게 돌다 결과 칸이 12시에 오게
      const base = Math.ceil(rotation.value / 360) * 360;
      const target = base + (seen ? 0 : 360 * 5) + (360 - center);
      if (!alive) return;
      const finish = () => {
        if (!alive) return;
        setDone(true);
        onDone?.(playKey);
      };
      setDone(false);
      rotation.value = seen ? target : withTiming(target, { duration: SPIN_MS, easing: Easing.out(Easing.cubic) });
      if (seen) finish();
      else {
        setTimeout(finish, SPIN_MS);
        AsyncStorage.setItem(key, '1').catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
  }, [playKey, center, rotation, onDone]);

  const wheel = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const won = items.find((x) => x.id === winner);

  return (
    <View style={styles.wrap} accessibilityLabel={done && won ? `룰렛 결과 ${won.label}` : '룰렛을 돌리는 중'}>
      <View style={styles.pointer} />
      <Animated.View style={wheel}>
        <Svg width={SIZE} height={SIZE}>
          {items.map((it, i) => {
            const a = i * seg;
            const path = items.length === 1
              ? `M ${R} 0 A ${R} ${R} 0 1 1 ${R - 0.01} 0 Z`
              : `M ${R} ${R} L ${point(a)} A ${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${point(a + seg)} Z`;
            return (
              <G key={it.id}>
                <Path d={path} fill={COLORS[i % COLORS.length]} stroke="#DCE2E6" strokeWidth={1} />
                <G transform={`rotate(${a + seg / 2} ${R} ${R})`}>
                  <SvgText x={R} y={R * 0.38} fill="#1D2A33" fontSize={14} fontWeight="500" textAnchor="middle">
                    {it.label.length > 9 ? `${it.label.slice(0, 8)}…` : it.label}
                  </SvgText>
                </G>
              </G>
            );
          })}
        </Svg>
      </Animated.View>
      {done && won && (
        <Animated.View entering={FadeIn.duration(300)}>
          <ThemedText type="subtitle" style={styles.result}>{won.label}</ThemedText>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  // 12시 방향 화살표 (아래를 가리키는 삼각형)
  pointer: {
    width: 0, height: 0, marginBottom: -14, zIndex: 1,
    borderLeftWidth: 12, borderRightWidth: 12, borderTopWidth: 20,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#E4002B',
  },
  result: { fontSize: 22, lineHeight: 30, textAlign: 'center', color: '#E4002B' },
});
