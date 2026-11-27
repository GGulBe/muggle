// Supabase 흉내(auth 스키마, 역할, 기본 권한) 위에서 migration + seed + 흐름 검증
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text,
    raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- 최근 Supabase처럼 새 테이블·함수에 기본 권한을 주지 않는다 (마이그레이션이 직접 grant 해야 통과)
  alter default privileges in schema public revoke execute on functions from public;
  create publication supabase_realtime;
`);
for (const f of readdirSync(`${root}/supabase/migrations`).sort()) {
  await db.exec(readFileSync(`${root}/supabase/migrations/${f}`, 'utf8'));
}
await db.exec(readFileSync(`${root}/supabase/seed.sql`, 'utf8'));

const P1 = '10000000-0000-0000-0000-000000000001';
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const as = async (n, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${U(n)}', false); set role authenticated;`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
};
const fails = async (n, sql, params, re) => {
  await assert.rejects(as(n, sql, params), re);
};

const count = async (sql) => (await db.query(sql)).rows[0].n;
console.log('stations', await count('select count(*)::int n from stations'),
  'edges', await count('select count(*)::int n from station_edges'),
  'places', await count('select count(*)::int n from places'),
  'reviews', await count('select count(*)::int n from reviews'),
  'profiles', await count('select count(*)::int n from profiles'));

// 블라인드: 남의 선호·가능 날짜는 안 보이고, 핀은 보인다
assert.equal((await as(1, 'select * from preferences')).length, 2);
assert.equal((await as(1, 'select * from availabilities')).every((r) => r.user_id === U(1)), true);
assert.equal((await as(1, 'select * from party_members where party_id = $1', [P1])).length, 4);
assert.equal((await as(5, 'select * from party_members where party_id = $1', [P1])).length, 0);
// 완료 플래그 직접 수정 불가, 핀은 수정 가능
await fails(4, 'update party_members set input_done = true where user_id = auth.uid()', [], /permission denied/);
await as(4, 'update party_members set has_car = true where user_id = auth.uid()');
// 입력 완료한 사람은 수정 불가
await fails(1, 'update party_members set has_car = true where user_id = auth.uid()', [], /row-level security/);
await fails(1, `insert into availabilities (party_id, day, slot) values ('${P1}', '2026-12-20', 'lunch')`, [], /row-level security/);

// 교집합: 인원수만
const slots = await as(1, 'select * from common_slots($1)', [P1]);
assert.deepEqual(Object.keys(slots[0]), ['day', 'slot', 'n']);

// 마지막 1명 완료 → ready, 날짜 확정 (12/12 저녁: 전원 가능)
assert.equal((await as(4, 'select set_done($1, true) s', [P1]))[0].s, 'ready');
const party = (await db.query('select * from parties where id = $1', [P1])).rows[0];
assert.equal(party.final_slot, 'dinner');
assert.equal(party.final_date.toISOString().slice(0, 10), '2026-12-12');

// 추천 함수 대신 후보 2개 넣고 투표 단계로
await db.exec(`insert into candidates select '${P1}', 1, id, id, 30, 20 from places order by id limit 2;
               update parties set status = 'voting' where id = '${P1}';`);
await fails(1, 'select set_done($1, true)', [P1], /vote first/);
for (const n of [1, 2, 3]) await as(n, 'insert into votes (party_id, round, place_id) values ($1, 1, 2)', [P1]);
await as(4, 'insert into votes (party_id, round, place_id) values ($1, 1, 1)', [P1]);
assert.equal((await as(1, 'select * from votes')).length, 1); // 본인 표만
await fails(1, 'select * from vote_counts($1)', [P1], /voting not finished/);
// 이모지: 기본 이모지만
await as(2, `insert into reactions (party_id, round, place_id, emoji) values ($1, 1, 1, '👍')`, [P1]);
await fails(2, `insert into reactions (party_id, round, place_id, emoji) values ($1, 1, 1, 'ok')`, [P1], /check/);
assert.equal((await as(3, 'select * from reactions')).length, 1);

for (const n of [1, 2, 3]) assert.equal((await as(n, 'select set_done($1, true) s', [P1]))[0].s, 'voting');
// 완료 취소 후 표 변경, 다시 완료
await as(3, 'select set_done($1, false)', [P1]);
await as(3, 'update votes set place_id = 1 where user_id = auth.uid()');
await as(3, 'select set_done($1, true)', [P1]);
assert.equal((await as(4, 'select set_done($1, true) s', [P1]))[0].s, 'closed');
const counts = await as(2, 'select * from vote_counts($1) order by place_id', [P1]);
assert.deepEqual(counts.map((r) => r.n), [2, 2]);
// 동점 → 점수 낮은(=1) 장소
assert.equal((await db.query('select final_place_id from parties where id = $1', [P1])).rows[0].final_place_id, 1);

// 후기: 확정 장소에만, 멤버만, 파티당 1개
await as(2, `insert into reviews (place_id, party_id, rating, menu) values (1, $1, 5, '삼겹살, 냉면')`, [P1]);
await fails(2, `insert into reviews (place_id, party_id, rating) values (1, $1, 4)`, [P1], /duplicate|unique/);
await fails(3, `insert into reviews (place_id, party_id, rating) values (2, $1, 4)`, [P1], /row-level security/); // 확정 장소 아님
await fails(8, `insert into reviews (place_id, party_id, rating) values (1, $1, 4)`, [P1], /row-level security/); // 멤버 아님
await fails(3, `insert into reviews (place_id, rating) values (1, 4)`, [], /row-level security/); // 파티 없는 후기
await as(2, 'delete from reviews where user_id = auth.uid() and party_id = $1', [P1]); // 수정 = 지우고 다시 쓰기
await as(2, `insert into reviews (place_id, party_id, rating) values (1, $1, 4)`, [P1]);

// 재투표: 방장만
await fails(2, `select restart_party($1, 'voting')`, [P1], /host only/);
await as(1, `select restart_party($1, 'voting')`, [P1]);
const p2 = (await db.query('select status, round from parties where id = $1', [P1])).rows[0];
assert.deepEqual(p2, { status: 'voting', round: 2 });
assert.equal(await count(`select count(*)::int n from candidates where party_id = '${P1}' and round = 2`), 2);

// 파티 생성·참여·인원 제한
const created = (await as(8, 'select * from create_party()'))[0];
assert.match(created.code, /^[2-9A-HJ-NP-Z]{6}$/);
assert.equal(created.fixed_radius_km, 1);
const region = (await as(8, "select * from create_party('region', 'gangnam', null, 3)"))[0];
assert.equal(region.fixed_radius_km, 3);
await assert.rejects(as(8, "select * from create_party('region', 'gangnam', null, 50)"));
for (const n of [1, 2, 3, 4, 5, 6, 7]) await as(n, 'select join_party($1)', [created.code.toLowerCase()]);
await db.exec(`insert into auth.users (id) values ('00000000-0000-0000-0000-000000000009')`);
await fails(9, 'select join_party($1)', [created.code], /full/);

// 나가기·삭제: 멤버는 나가기만, 방장은 나가기 불가·삭제만, 남의 파티 삭제 불가
await as(7, 'select leave_party($1)', [created.id]);
await as(9, 'select join_party($1)', [created.code]); // 빈자리에 참여 가능
await fails(8, 'select leave_party($1)', [created.id], /host cannot leave/);
await fails(1, 'select delete_party($1)', [created.id], /host only/);
await fails(2, 'select leave_party($1)', [P1], /already started/); // P1은 위에서 투표 단계
await as(8, 'select delete_party($1)', [created.id]);
assert.equal(await count(`select count(*)::int n from party_members where party_id = '${created.id}'`), 0);

// 추천 함수(service_role)가 읽고 쓰는 범위
await db.exec(`set role service_role;
  select 1 from parties, party_members, preferences, stations, station_edges, places, reviews limit 1;
  insert into candidates select '${P1}', 99, id, 1, 1, 1 from places limit 1 on conflict do nothing;
  update parties set status = status where id = '${P1}';
  reset role;`);

console.log('sql check: ok');

// 더미 DEMO01로 실제 추천 실행
const { recommend } = await import(`${root}/supabase/functions/recommend/core.ts`);
const q = async (sql) => (await db.query(sql)).rows;
const stations = await q('select id, lat, lng from stations');
const edges = await q('select from_id, to_id, minutes from station_edges');
const seen = new Set(['gangnam']); let grew = true;
while (grew) { grew = false; for (const e of edges) for (const [a, b] of [[e.from_id, e.to_id], [e.to_id, e.from_id]]) if (seen.has(a) && !seen.has(b)) { seen.add(b); grew = true; } }
assert.equal(seen.size, stations.length, 'station graph is disconnected');
const result = recommend({
  members: await q(`select lat, lng, has_car from party_members where party_id = '${P1}'`),
  stations, edges,
  places: await q(`select p.id, p.category, p.station_id, p.lat, p.lng, coalesce(avg(r.rating), 0)::float8 rating
                   from places p left join reviews r on r.place_id = p.id where 'dinner' = any(p.meal_types) group by p.id`),
  prefs: await q(`select kind, target_type, target from preferences where user_id in (select user_id from party_members where party_id = '${P1}')`),
});
const names = new Map((await q('select id, name from places')).map((p) => [p.id, p.name]));
for (const c of result) console.log(names.get(c.place_id), `최대 ${c.max_min.toFixed(0)}분 / 평균 ${c.avg_min.toFixed(0)}분 / 점수 ${c.score.toFixed(1)}`);
