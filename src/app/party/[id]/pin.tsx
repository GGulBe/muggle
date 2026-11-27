import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { mapPageUrl, type Member } from '@/lib/party';
import { supabase } from '@/lib/supabase';

type Pin = { lat: number; lng: number; address: string };
type MapMessage = ({ type: 'pin' } & Pin) | { type: 'ready' } | { type: 'error'; message: string };

export default function PinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const web = useRef<WebView<object>>(null); // <object>: 라이브러리 타입의 기본값(undefined)이 TS 6에서 props를 never로 만든다
  const [start, setStart] = useState<{ lat: number | null; lng: number | null } | null>(null);
  const [others, setOthers] = useState<{ lat: number; lng: number; name: string }[]>([]);
  const [pin, setPin] = useState<Pin | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('party_members')
        .select('user_id, lat, lng, profiles(nickname)')
        .eq('party_id', id);
      const rows = (data as Pick<Member, 'user_id' | 'lat' | 'lng' | 'profiles'>[] | null) ?? [];
      const mine = rows.find((m) => m.user_id === u.user?.id);
      setStart({ lat: mine?.lat ?? null, lng: mine?.lng ?? null });
      setOthers(
        rows
          .filter((m) => m.user_id !== u.user?.id && m.lat != null && m.lng != null)
          .map((m) => ({ lat: m.lat!, lng: m.lng!, name: m.profiles?.nickname || '멤버' })),
      );
    })();
  }, [id]);

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data) as MapMessage;
    if (msg.type === 'pin') setPin({ lat: msg.lat, lng: msg.lng, address: msg.address });
    // 다른 멤버 이름은 지도 페이지에서 이스케이프해 표시한다
    if (msg.type === 'ready') web.current?.injectJavaScript(`window.setOthers(${JSON.stringify(others)}); true;`);
    if (msg.type === 'error') Alert.alert('지도 오류', msg.message);
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return Alert.alert('위치 권한이 필요해요', '설정에서 위치 권한을 허용하거나 지도에서 직접 골라 주세요.');
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      web.current?.injectJavaScript(`window.setCenter(${coords.latitude}, ${coords.longitude}); true;`);
    } catch (e) {
      Alert.alert('현재 위치를 찾지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!pin) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('party_members')
      .update({ lat: pin.lat, lng: pin.lng })
      .eq('party_id', id)
      .eq('user_id', u.user!.id);
    setSaving(false);
    if (error) return Alert.alert('저장하지 못했어요', error.message);
    router.back();
  };

  if (!process.env.EXPO_PUBLIC_KAKAO_JS_KEY) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.centerText}>.env.local에 EXPO_PUBLIC_KAKAO_JS_KEY(카카오 JavaScript 키)를 넣고 앱을 다시 실행하세요.</ThemedText>
      </ThemedView>
    );
  }
  if (!start) return <ThemedView style={styles.center}><ActivityIndicator /></ThemedView>;

  return (
    <ThemedView style={styles.container}>
      <WebView<object>
        ref={web}
        source={{ uri: mapPageUrl(start.lat, start.lng) }}
        onMessage={onMessage}
        style={styles.map}
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} />}
      />
      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <ThemedText numberOfLines={1}>{pin ? pin.address || '선택한 위치' : '지도를 눌러 출발지를 골라 주세요'}</ThemedText>
        <View style={styles.buttons}>
          <Button title="현재 위치" variant="secondary" onPress={useMyLocation} busy={locating} style={styles.flex} />
          <Button title="이 위치로 저장" onPress={save} disabled={!pin} busy={saving} style={styles.flex} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  centerText: { textAlign: 'center' },
  panel: { padding: Spacing.three, gap: Spacing.two },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
