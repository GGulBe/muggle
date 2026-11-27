import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY; // publishable(anon) 키. 공개돼도 되는 키, RLS가 보호

// .env.local이 아직 없으면 앱이 죽지 않고 설정 안내 화면을 띄운다
export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// 로그인 후 돌아온 주소(#access_token=... 또는 ?access_token=...)로 세션을 만든다.
// 로그인 창이 결과를 돌려줄 때와 딥링크로 앱이 열릴 때 둘 다 여기로 온다. 토큰이 없으면 false
export async function setSessionFromUrl(link: string): Promise<boolean> {
  const params = Object.fromEntries(new URLSearchParams(link.split(/[?#]/).slice(1).join('&')));
  if (params.error) throw new Error(params.error_description ?? params.error);
  if (!params.access_token || !params.refresh_token) return false;
  const { error } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  if (error) throw error;
  return true;
}

// 앱이 백그라운드일 때는 토큰 자동 갱신을 멈춘다
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
