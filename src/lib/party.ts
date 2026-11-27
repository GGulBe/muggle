import * as Linking from 'expo-linking';

export type Party = {
  id: string;
  code: string;
  host_id: string;
  status: 'gathering' | 'voting' | 'closed';
  created_at: string;
};

export type Member = {
  user_id: string;
  lat: number | null;
  lng: number | null;
  has_car: boolean;
  input_done: boolean;
  vote_done: boolean;
  profiles: { nickname: string } | null;
};

export const STATUS_LABEL: Record<Party['status'], string> = {
  gathering: '입력 받는 중',
  voting: '투표 중',
  closed: '확정',
};

export const MAX_MEMBERS = 8;

// 초대 링크: 빌드 앱은 muggle://join/CODE, Expo Go는 exp://<IP>:<port>/--/join/CODE (같은 Wi-Fi에서만 열림)
export const inviteUrl = (code: string) => Linking.createURL(`join/${code}`);

// 카카오맵 페이지 (docs/map, GitHub Pages). JS 키는 카카오 디벨로퍼스에 등록한 도메인에서만 동작
export const mapPageUrl = (lat?: number | null, lng?: number | null) => {
  const q = new URLSearchParams({ key: process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '' });
  if (lat != null && lng != null) {
    q.set('lat', String(lat));
    q.set('lng', String(lng));
  }
  return `https://ggulbe.github.io/muggle/map/?${q}`;
};
