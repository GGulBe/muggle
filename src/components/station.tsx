import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

// 시그니처: 지하철 노선도의 역 표시(빙하색 고리)를 붙인 역 이름. 역 이름이 나오는 곳에만 쓴다
export function Station({ name, size = 'small' }: { name: string; size?: 'small' | 'default' }) {
  return (
    <View style={styles.row}>
      <View style={[styles.ring, size === 'default' && styles.big]} />
      <ThemedText type={size === 'small' ? 'small' : 'default'} themeColor="textSecondary">{name}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Palette.glacier, backgroundColor: Palette.white },
  big: { width: 12, height: 12, borderRadius: 6, borderWidth: 3 },
});
