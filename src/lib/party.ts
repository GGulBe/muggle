import * as Linking from 'expo-linking';

export type Slot = 'breakfast' | 'lunch' | 'dinner';

export type Party = {
  id: string;
  code: string;
  host_id: string;
  status: 'gathering' | 'voting' | 'closed';
  created_at: string;
};

// 파티 화면에서 쓰는 상세 정보 (고정 모드·확정 결과 포함)
export type PartyDetail = Party & {
  round: number;
  fixed_mode: 'none' | 'region' | 'place';
  final_date: string | null;
  final_slot: Slot | null;
  fixed_station: { name: string } | null;
  fixed_place: { name: string } | null;
  final_place: { name: string } | null;
};

export const PARTY_DETAIL_SELECT =
  'id, code, host_id, status, created_at, round, fixed_mode, final_date, final_slot,' +
  ' fixed_station:stations!fixed_station_id(name), fixed_place:places!fixed_place_id(name),' +
  ' final_place:places!final_place_id(name)';

export type Candidate = {
  place_id: number;
  score: number;
  max_min: number;
  avg_min: number;
  places: { name: string; category: string; stations: { name: string } | null } | null;
};

export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner'];
export const SLOT_LABEL: Record<Slot, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁' };

// 'YYYY-MM-DD' (기기 현지 날짜. toISOString은 UTC라 한국 새벽에 하루 밀린다)
export const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
// '2026-12-12' → '12/12(토)'
export const formatDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}(${WEEKDAY[new Date(y, m - 1, d).getDay()]})`;
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
