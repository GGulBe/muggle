-- 더미데이터. `supabase db reset` 또는 SQL Editor에서 실행.
-- 실제 데이터로 바꿀 때: delete from places where is_dummy; 역·간선은 공공데이터포털 CSV로 교체.

-- ───────── 약속 명소 역 30곳 (좌표는 근사값) ─────────
insert into public.stations (id, name, lat, lng, is_hotspot) values
  ('gangnam',      '강남',       37.4979, 127.0276, true),
  ('hongik',       '홍대입구',   37.5572, 126.9245, true),
  ('seongsu',      '성수',       37.5446, 127.0559, true),
  ('jamsil',       '잠실',       37.5133, 127.1001, true),
  ('jongno3',      '종로3가',    37.5704, 126.9921, true),
  ('konkuk',       '건대입구',   37.5404, 127.0692, true),
  ('sadang',       '사당',       37.4765, 126.9816, true),
  ('pangyo',       '판교',       37.3948, 127.1112, true),
  ('suwon',        '수원',       37.2660, 127.0000, true),
  ('bupyeong',     '부평',       37.4895, 126.7245, true),
  ('sinchon',      '신촌',       37.5551, 126.9369, true),
  ('hapjeong',     '합정',       37.5495, 126.9139, true),
  ('itaewon',      '이태원',     37.5345, 126.9946, true),
  ('myeongdong',   '명동',       37.5609, 126.9863, true),
  ('seoul',        '서울역',     37.5547, 126.9707, true),
  ('yeouido',      '여의도',     37.5216, 126.9243, true),
  ('yeongdeungpo', '영등포',     37.5156, 126.9073, true),
  ('sillim',       '신림',       37.4842, 126.9297, true),
  ('nowon',        '노원',       37.6551, 127.0613, true),
  ('suyu',         '수유',       37.6380, 127.0257, true),
  ('wangsimni',    '왕십리',     37.5612, 127.0371, true),
  ('cheonho',      '천호',       37.5386, 127.1236, true),
  ('gyodae',       '교대',       37.4934, 127.0140, true),
  ('seolleung',    '선릉',       37.5045, 127.0490, true),
  ('samseong',     '삼성',       37.5088, 127.0631, true),
  ('hyehwa',       '혜화',       37.5822, 127.0018, true),
  ('express',      '고속터미널', 37.5049, 127.0049, true),
  ('incheoncity',  '인천시청',   37.4572, 126.7022, true),
  ('jeongbalsan',  '정발산',     37.6596, 126.7733, true),
  ('seohyeon',     '서현',       37.3850, 127.1233, true);

-- ───────── 간선: 각 역을 가까운 4개 역과 연결 (평균 30km/h + 정차 2분) ─────────
-- ponytail: 실제 노선이 아닌 근사 그래프. 공공데이터 역간 소요시간으로 교체 예정
create function pg_temp.km(a_lat float8, a_lng float8, b_lat float8, b_lng float8) returns float8
language sql immutable as $$
  select 12742 * asin(sqrt(
    sin(radians(b_lat - a_lat) / 2) ^ 2 +
    cos(radians(a_lat)) * cos(radians(b_lat)) * sin(radians(b_lng - a_lng) / 2) ^ 2));
$$;

insert into public.station_edges (from_id, to_id, minutes)
select a.id, n.id, round((pg_temp.km(a.lat, a.lng, n.lat, n.lng) * 2 + 2)::numeric, 1)
from public.stations a
cross join lateral (
  select b.* from public.stations b where b.id <> a.id
  order by pg_temp.km(a.lat, a.lng, b.lat, b.lng) limit 4) n
on conflict do nothing;

-- ───────── 식당: 역마다 5곳 = 150곳 ─────────
insert into public.places (name, category, station_id, lat, lng, meal_types, is_dummy)
select s.name || ' ' || c.cat || ' ' || i,
       c.cat, s.id,
       s.lat + (i - 3) * 0.0012,
       s.lng + ((i * 7) % 5 - 2) * 0.0012,
       case c.cat when '카페' then '{breakfast,lunch}'::text[]
                  when '술집' then '{dinner}'::text[]
                  when '분식' then '{breakfast,lunch,dinner}'::text[]
                  else '{lunch,dinner}'::text[] end,
       true
from (select *, row_number() over (order by id) as rn from public.stations) s
cross join generate_series(1, 5) i
cross join lateral (
  select (array['한식','중식','일식','양식','고기','분식','카페','술집'])[1 + ((s.rn + i) % 8)::int] as cat) c;

-- ───────── 가상 유저 8명 (트리거가 profiles 생성) ─────────
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-0000-00000000000' || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'dummy' || n || '@example.com',
       jsonb_build_object('name', '더미' || n), now(), now()
from generate_series(1, 8) n;

-- ───────── 리뷰: 장소당 0~3개 ─────────
select setseed(0.42);
insert into public.reviews (place_id, user_id, rating, menu, body)
select p.id, ('00000000-0000-0000-0000-00000000000' || (1 + (p.id + k) % 8))::uuid,
       3 + floor(random() * 3)::int, p.category || ' 메뉴', '더미 리뷰'
from public.places p
cross join generate_series(1, 3) k
where random() < 0.5;

-- ───────── 데모 파티 2개 ─────────
-- DEMO01: 장소 미정, 4명 중 3명 입력 완료 (발표 때 마지막 1명을 완료해 추천 시연)
-- DEMO02: 성수 지역 고정, 수집 중
insert into public.parties (id, code, host_id, fixed_mode, fixed_station_id) values
  ('10000000-0000-0000-0000-000000000001', 'DEMO01', '00000000-0000-0000-0000-000000000001', 'none', null),
  ('10000000-0000-0000-0000-000000000002', 'DEMO02', '00000000-0000-0000-0000-000000000005', 'region', 'seongsu');

insert into public.party_members (party_id, user_id, lat, lng, has_car, input_done) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 37.6540, 127.0560, false, true),  -- 노원
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 37.4840, 126.9300, false, true),  -- 신림
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 37.4900, 126.7250, true,  true),  -- 부평, 자차
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 37.3950, 127.1100, false, false), -- 판교
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 37.5400, 127.0700, false, false),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 37.5600, 127.0370, false, false),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000007', 37.5130, 127.1000, true,  false);

-- 12/12(토)·12/13(일) 저녁이 전원 겹치도록
insert into public.availabilities (party_id, user_id, day, slot)
select '10000000-0000-0000-0000-000000000001'::uuid, u::uuid, d::date, s
from unnest(array['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
                  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004']) u
cross join unnest(array['2026-12-12', '2026-12-13']) d
cross join unnest(array['lunch', 'dinner']) s
where not (u like '%2' and s = 'lunch');   -- 더미2는 저녁만 가능

insert into public.preferences (user_id, kind, target_type, target) values
  ('00000000-0000-0000-0000-000000000001', 'like',    'category', '고기'),
  ('00000000-0000-0000-0000-000000000001', 'dislike', 'category', '일식'),
  ('00000000-0000-0000-0000-000000000002', 'like',    'category', '한식'),
  ('00000000-0000-0000-0000-000000000002', 'like',    'region',   'hongik'),
  ('00000000-0000-0000-0000-000000000003', 'dislike', 'region',   'pangyo'),
  ('00000000-0000-0000-0000-000000000004', 'like',    'category', '양식'),
  ('00000000-0000-0000-0000-000000000005', 'dislike', 'category', '술집'),
  ('00000000-0000-0000-0000-000000000006', 'like',    'category', '카페');
