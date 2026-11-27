// 실행: node supabase/functions/recommend/core.test.ts
import assert from 'node:assert/strict';
import { recommend, type Place, type Station } from './core.ts';

// 동서로 일렬인 역 A — B — C (약 5.5km 간격, 각 10분)
const stations: Station[] = [
  { id: 'A', lat: 37.5, lng: 126.90 },
  { id: 'B', lat: 37.5, lng: 126.96 },
  { id: 'C', lat: 37.5, lng: 127.02 },
];
const edges = [
  { from_id: 'A', to_id: 'B', minutes: 10 },
  { from_id: 'B', to_id: 'C', minutes: 10 },
];
const at = (id: number, station_id: string, category: string, rating = 0): Place => {
  const s = stations.find((x) => x.id === station_id)!;
  return { id, station_id, category, rating, lat: s.lat, lng: s.lng };
};
const places = [at(1, 'A', '한식'), at(2, 'B', '한식'), at(3, 'C', '한식'), at(4, 'B', '일식')];
const members = [
  { lat: 37.5, lng: 126.90, has_car: false }, // A 근처
  { lat: 37.5, lng: 127.02, has_car: false }, // C 근처
];

// 1) 공정성: 가운데 B가 1위
let r = recommend({ members, stations, edges, places, prefs: [] });
assert.equal(places.find((p) => p.id === r[0].place_id)!.station_id, 'B');
assert.ok(r[0].max_min < r.find((c) => c.place_id === 1)!.max_min);

// 2) 비선호 하드 필터: 한식을 싫어하면 일식(4)이 1위, 한식은 뒤로
r = recommend({ members, stations, edges, places, prefs: [{ kind: 'dislike', target_type: 'category', target: '한식' }] });
assert.equal(r[0].place_id, 4);
assert.equal(r.length, 4); // 5곳이 안 되면 비선호 장소로 채움

// 3) 역당 최대 2곳
const crowded = [...places, at(5, 'B', '중식'), at(6, 'B', '양식')];
r = recommend({ members, stations, edges, places: crowded, prefs: [] });
assert.equal(r.filter((c) => crowded.find((p) => p.id === c.place_id)!.station_id === 'B').length, 2);

// 4) 지역 고정: C 반경 1km만, 별점 높은 순
r = recommend({ members, stations, edges, places: [...places, at(7, 'C', '고기', 5)], prefs: [], fixedStationId: 'C' });
assert.deepEqual(r.map((c) => c.place_id), [7, 3]);
// 지역 고정에서는 역당 2곳 제한 없음 (같은 동네 4곳 모두)
r = recommend({ members, stations, edges, places: [at(3, 'C', '한식'), at(7, 'C', '고기'), at(8, 'C', '중식'), at(9, 'C', '양식')], prefs: [], fixedStationId: 'C' });
assert.equal(r.length, 4);
// 반경을 넓히면 옆 역(B, 약 5.3km)까지 포함
r = recommend({ members, stations, edges, places, prefs: [], fixedStationId: 'C', fixedRadiusKm: 6 });
assert.ok(r.some((c) => c.place_id === 2));

// 5) 자차 멤버는 더 짧은 쪽 사용
const withCar = recommend({ members: [{ ...members[0], has_car: true }, members[1]], stations, edges, places, prefs: [] });
assert.ok(withCar.every((c) => Number.isFinite(c.max_min)));

console.log('core.test: ok');
