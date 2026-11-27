// POST { party_id } — 전원 '입력 완료' 후 앱이 호출. 후보를 만들고 투표 단계로 넘긴다.
// 선호 데이터는 서버 키로만 읽고, 응답에는 절대 넣지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { recommend } from './core.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
const secret = secretKeys ? JSON.parse(secretKeys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, secret, { auth: { persistSession: false } });

const fail = (status: number, error: string) => Response.json({ error }, { status });

Deno.serve(async (req) => {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return fail(401, 'login required');

  const { party_id } = await req.json().catch(() => ({}));
  if (typeof party_id !== 'string') return fail(400, 'party_id required');

  const { data: party } = await admin.from('parties').select('*').eq('id', party_id).single();
  const { data: members } = await admin.from('party_members').select('*').eq('party_id', party_id);
  if (!party || !members?.some((m) => m.user_id === user.id)) return fail(403, 'not a member');
  if (party.status !== 'gathering' || members.length < 2 || !members.every((m) => m.input_done) || !party.final_slot) {
    return fail(409, 'not everyone has finished input');
  }

  const [{ data: prefs }, { data: stations }, { data: edges }, { data: places }, { data: ratings }] = await Promise.all([
    admin.from('preferences').select('kind, target_type, target').in('user_id', members.map((m) => m.user_id)),
    admin.from('stations').select('id, lat, lng'),
    admin.from('station_edges').select('from_id, to_id, minutes'),
    admin.from('places').select('id, category, station_id, lat, lng').contains('meal_types', [party.final_slot]),
    admin.from('reviews').select('place_id, rating'),
  ]);

  // ponytail: 평균 별점을 매번 전체 리뷰에서 계산. 리뷰가 수만 건이 되면 뷰나 캐시 컬럼으로
  const sum = new Map<number, [number, number]>();
  for (const r of ratings ?? []) {
    const [s, n] = sum.get(r.place_id) ?? [0, 0];
    sum.set(r.place_id, [s + r.rating, n + 1]);
  }

  const result = recommend({
    members: members.map((m) => ({ lat: m.lat, lng: m.lng, has_car: m.has_car })),
    stations: stations ?? [],
    edges: edges ?? [],
    places: (places ?? []).map((p) => {
      const [s, n] = sum.get(p.id) ?? [0, 0];
      return { ...p, rating: n ? s / n : 0 };
    }),
    prefs: prefs ?? [],
    fixedStationId: party.fixed_mode === 'region' ? party.fixed_station_id : null,
  });
  if (result.length === 0) return fail(422, 'no places match');

  await admin.from('candidates').upsert(result.map((c) => ({ ...c, party_id, round: party.round })));
  // 동시에 두 명이 호출해도 한 번만 넘어가도록 조건부 업데이트
  await admin.from('parties').update({ status: 'voting' }).eq('id', party_id).eq('status', 'gathering');

  return Response.json({ candidates: result.map(({ place_id, max_min, avg_min }) => ({ place_id, max_min, avg_min })) });
});
