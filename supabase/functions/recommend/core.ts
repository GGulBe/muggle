// 추천 알고리즘 (순수 함수). Edge Function과 Node 테스트가 같이 쓴다.
// PRD '추천 알고리즘' 참고: 최대 이동시간(공정성) → 평균 → 선호·별점.

export type Station = { id: string; lat: number; lng: number };
export type Edge = { from_id: string; to_id: string; minutes: number };
export type Place = { id: number; category: string; station_id: string; lat: number; lng: number; rating: number };
export type Member = { lat: number; lng: number; has_car: boolean };
export type Pref = { kind: 'like' | 'dislike'; target_type: 'category' | 'region'; target: string };
export type Candidate = { place_id: number; score: number; max_min: number; avg_min: number };

// 튜닝용 계수 — 실측값과 비교해 조정
export const CFG = {
  walkKmh: 4.5, walkDetour: 1.3, accessStations: 3,
  busKmh: 15, busWaitMin: 5,          // 역이 먼 경우(더미 데이터는 역이 30개뿐) 버스 근사
  carKmh: 25, carDetour: 1.4, parkMin: 10,
  wMax: 0.6, wAvg: 0.4, wLike: 5, wRating: 3,
  perStation: 2, top: 5, fixedRadiusKm: 1,
};

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// 출발지 → 역 접근 시간: 도보와 버스 근사 중 짧은 쪽
function accessMin(d: number): number {
  const walk = (d * CFG.walkDetour) / CFG.walkKmh * 60;
  const bus = (d * CFG.walkDetour) / CFG.busKmh * 60 + CFG.busWaitMin;
  return Math.min(walk, bus);
}

// ponytail: O(V²) 다익스트라. 수도권 전 역(~700)까지는 충분, 버스 노선까지 넣으면 힙으로 교체
function dijkstra(adj: Map<string, [string, number][]>, start: Map<string, number>): Map<string, number> {
  const dist = new Map(start);
  const done = new Set<string>();
  while (true) {
    let u: string | null = null;
    for (const [k, v] of dist) if (!done.has(k) && (u === null || v < dist.get(u)!)) u = k;
    if (u === null) return dist;
    done.add(u);
    for (const [v, w] of adj.get(u) ?? []) {
      const nd = dist.get(u)! + w;
      if (nd < (dist.get(v) ?? Infinity)) dist.set(v, nd);
    }
  }
}

export function travelMinutes(m: Member, stations: Station[], adj: Map<string, [string, number][]>, places: Place[]): number[] {
  const start = new Map(
    stations.map((s) => [s.id, accessMin(km(m, s))] as [string, number])
      .sort((a, b) => a[1] - b[1]).slice(0, CFG.accessStations),
  );
  const dist = dijkstra(adj, start);
  const byId = new Map(stations.map((s) => [s.id, s]));
  return places.map((p) => {
    const st = byId.get(p.station_id)!;
    const transit = (dist.get(p.station_id) ?? Infinity) + accessMin(km(st, p));
    const car = m.has_car ? (km(m, p) * CFG.carDetour) / CFG.carKmh * 60 + CFG.parkMin : Infinity;
    return Math.min(transit, car);
  });
}

export function recommend(input: {
  members: Member[]; stations: Station[]; edges: Edge[]; places: Place[];
  prefs: Pref[];                     // 전원의 선호 (멤버 구분 불필요: 개수만 센다)
  fixedStationId?: string | null;    // 지역 고정 모드
  fixedRadiusKm?: number;            // 지역 고정 반경 (기본 CFG.fixedRadiusKm)
}): Candidate[] {
  const { members, stations, edges, prefs, fixedStationId, fixedRadiusKm = CFG.fixedRadiusKm } = input;
  const adj = new Map<string, [string, number][]>();
  for (const e of edges) {
    adj.set(e.from_id, [...(adj.get(e.from_id) ?? []), [e.to_id, e.minutes]]);
    adj.set(e.to_id, [...(adj.get(e.to_id) ?? []), [e.from_id, e.minutes]]);
  }

  let places = input.places;
  if (fixedStationId) {
    const c = stations.find((s) => s.id === fixedStationId)!;
    places = places.filter((p) => km(c, p) <= fixedRadiusKm);
  }

  const count = (kind: Pref['kind'], p: Place) =>
    prefs.filter((f) => f.kind === kind &&
      (f.target_type === 'category' ? f.target === p.category : f.target === p.station_id)).length;

  const times = members.map((m) => travelMinutes(m, stations, adj, places));
  const scored = places.map((p, i) => {
    const t = times.map((row) => row[i]);
    const max = Math.max(...t);
    const avg = t.reduce((a, b) => a + b, 0) / t.length;
    const pref = CFG.wLike * count('like', p) + CFG.wRating * p.rating;
    // 고정 모드는 이동시간 항을 빼고 선호·별점만
    const score = fixedStationId ? -pref : CFG.wMax * max + CFG.wAvg * avg - pref;
    return { p, dislikes: count('dislike', p), c: { place_id: p.id, score, max_min: max, avg_min: avg } };
  });

  // 비선호 0개가 먼저(하드 필터), 모자라면 비선호 적은 순으로 채움
  scored.sort((a, b) => a.dislikes - b.dislikes || a.c.score - b.c.score);
  const perStation = new Map<string, number>();
  const out: Candidate[] = [];
  for (const s of scored) {
    if (out.length === CFG.top) break;
    const n = perStation.get(s.p.station_id) ?? 0;
    // 역당 제한은 후보가 한 동네에 몰리지 않게 하려는 것. 동네를 고정했으면 적용하지 않는다
    if (!fixedStationId && n >= CFG.perStation) continue;
    perStation.set(s.p.station_id, n + 1);
    out.push(s.c);
  }
  return out;
}
