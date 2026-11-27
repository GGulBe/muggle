-- 약속장소 추천 앱 초기 스키마
-- 공개 범위는 화면이 아니라 여기(RLS + 함수)에서 강제한다. PRD '블라인드·익명 규칙' 참고.

-- ───────── 사용자 ─────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null default '',
  avatar_url text
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'nickname',
             new.raw_user_meta_data->>'user_name', ''),
    new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ───────── 지도 데이터 ─────────
create table public.stations (
  id text primary key,                 -- 'gangnam'
  name text not null,
  line text not null default '',
  lat float8 not null,
  lng float8 not null,
  is_hotspot boolean not null default false
);

create table public.station_edges (
  from_id text references public.stations on delete cascade,
  to_id text references public.stations on delete cascade,
  minutes real not null check (minutes > 0),
  primary key (from_id, to_id)
);

create table public.categories (name text primary key);
insert into public.categories values ('한식'),('중식'),('일식'),('양식'),('고기'),('분식'),('카페'),('술집');

create table public.places (
  id serial primary key,
  name text not null,
  category text not null references public.categories,
  station_id text not null references public.stations,
  lat float8 not null,
  lng float8 not null,
  meal_types text[] not null default '{lunch,dinner}',
  is_dummy boolean not null default false
);
create index on public.places (station_id);

-- ───────── 파티 ─────────
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid not null references public.profiles,
  status text not null default 'gathering' check (status in ('gathering', 'voting', 'closed')),
  round int not null default 1,
  fixed_mode text not null default 'none' check (fixed_mode in ('none', 'region', 'place')),
  fixed_station_id text references public.stations,
  fixed_place_id int references public.places,
  final_place_id int references public.places,
  final_date date,
  final_slot text check (final_slot in ('breakfast', 'lunch', 'dinner')),
  created_at timestamptz not null default now(),
  check ((fixed_mode = 'region') = (fixed_station_id is not null)),
  check ((fixed_mode = 'place') = (fixed_place_id is not null))
);

create table public.party_members (
  party_id uuid references public.parties on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  lat float8,
  lng float8,
  has_car boolean not null default false,
  input_done boolean not null default false,
  vote_done boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

create table public.availabilities (
  party_id uuid,
  user_id uuid default auth.uid(),
  day date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner')),
  primary key (party_id, user_id, day, slot),
  foreign key (party_id, user_id) references public.party_members on delete cascade
);

-- 선호는 파티와 무관하게 사용자 단위. target = 카테고리명 또는 station id
create table public.preferences (
  user_id uuid default auth.uid() references public.profiles on delete cascade,
  kind text check (kind in ('like', 'dislike')),
  target_type text check (target_type in ('category', 'region')),
  target text not null,
  primary key (user_id, kind, target_type, target)
);

create table public.candidates (
  party_id uuid references public.parties on delete cascade,
  round int,
  place_id int references public.places,
  score real not null,
  max_min real,
  avg_min real,
  primary key (party_id, round, place_id)
);

create table public.votes (
  party_id uuid,
  round int,
  user_id uuid default auth.uid() references public.profiles on delete cascade,
  place_id int not null,
  primary key (party_id, round, user_id),
  foreign key (party_id, round, place_id) references public.candidates on delete cascade
);

create table public.reactions (
  party_id uuid,
  round int,
  user_id uuid default auth.uid() references public.profiles on delete cascade,
  place_id int,
  emoji text,
  primary key (party_id, round, user_id, place_id, emoji),
  foreign key (party_id, round, place_id) references public.candidates on delete cascade,
  -- 기본 이모지 1개만 (ZWJ 조합 이모지 고려해 16 code point까지, 글자·숫자·공백 불가)
  check (char_length(emoji) between 1 and 16 and emoji !~ '[[:alnum:][:space:]]')
);

create table public.reviews (
  id serial primary key,
  place_id int not null references public.places,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  party_id uuid references public.parties on delete set null,
  rating int not null check (rating between 1 and 5),
  menu text,
  body text,
  created_at timestamptz not null default now()
);

-- ───────── 헬퍼 ─────────
create function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.party_members where party_id = p and user_id = auth.uid());
$$;

-- 수집 단계이고 내가 아직 '입력 완료'를 안 눌렀을 때만 입력 수정 가능
create function public.can_edit_input(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.party_members m join public.parties pa on pa.id = m.party_id
    where m.party_id = p and m.user_id = auth.uid() and pa.status = 'gathering' and not m.input_done);
$$;

create function public.can_vote(p uuid, r int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.party_members m join public.parties pa on pa.id = m.party_id
    where m.party_id = p and m.user_id = auth.uid()
      and pa.status = 'voting' and pa.round = r and not m.vote_done);
$$;

-- ───────── RLS ─────────
alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.station_edges enable row level security;
alter table public.categories enable row level security;
alter table public.places enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.availabilities enable row level security;
alter table public.preferences enable row level security;
alter table public.candidates enable row level security;
alter table public.votes enable row level security;
alter table public.reactions enable row level security;
alter table public.reviews enable row level security;

create policy "read" on public.profiles for select to authenticated using (true);
create policy "own" on public.profiles for update to authenticated using (id = auth.uid());

create policy "read" on public.stations for select to authenticated using (true);
create policy "read" on public.station_edges for select to authenticated using (true);
create policy "read" on public.categories for select to authenticated using (true);
create policy "read" on public.places for select to authenticated using (true);

-- 파티 생성·참여·상태 변경은 아래 함수로만 (insert/update 정책 없음)
create policy "member" on public.parties for select to authenticated using (public.is_member(id));

-- 출발지 핀·완료 여부는 파티 멤버에게 공개
create policy "member" on public.party_members for select to authenticated
  using (public.is_member(party_id));
create policy "own pin" on public.party_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_edit_input(party_id));
-- 완료 플래그는 set_done()으로만 바꾸도록 수정 가능 컬럼을 제한
revoke update on public.party_members from anon, authenticated;
grant update (lat, lng, has_car) on public.party_members to authenticated;

-- 가능 날짜: 본인 것만. 교집합은 common_slots()가 인원수만 반환
create policy "own" on public.availabilities for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_edit_input(party_id));

-- 선호·비선호: 본인만. 추천 함수(서비스 키)만 전원 것을 읽는다
create policy "own" on public.preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "member" on public.candidates for select to authenticated
  using (public.is_member(party_id));

-- 투표: 본인 표만 보임. 집계는 vote_counts()가 전원 완료 후에만 반환
create policy "own" on public.votes for select to authenticated using (user_id = auth.uid());
create policy "cast" on public.votes for insert to authenticated
  with check (user_id = auth.uid() and public.can_vote(party_id, round));
create policy "change" on public.votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_vote(party_id, round));
create policy "retract" on public.votes for delete to authenticated
  using (user_id = auth.uid() and public.can_vote(party_id, round));

-- 이모지 반응: 실시간 공개
create policy "member" on public.reactions for select to authenticated
  using (public.is_member(party_id));
create policy "add" on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(party_id));
create policy "remove" on public.reactions for delete to authenticated using (user_id = auth.uid());

-- 리뷰: 로그인한 앱 사용자 전체
create policy "read" on public.reviews for select to authenticated using (true);
create policy "write" on public.reviews for insert to authenticated with check (user_id = auth.uid());
create policy "delete" on public.reviews for delete to authenticated using (user_id = auth.uid());

-- ───────── 함수 (앱은 supabase.rpc()로 호출) ─────────
create function public.create_party(
  p_fixed_mode text default 'none', p_fixed_station_id text default null, p_fixed_place_id int default null)
returns public.parties
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_party public.parties;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  loop
    -- 헷갈리는 0/O/1/I 제외
    select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.parties where code = v_code);
  end loop;
  insert into public.parties (code, host_id, fixed_mode, fixed_station_id, fixed_place_id)
  values (v_code, auth.uid(), p_fixed_mode, p_fixed_station_id, p_fixed_place_id)
  returning * into v_party;
  insert into public.party_members (party_id, user_id) values (v_party.id, auth.uid());
  return v_party;
end $$;

create function public.join_party(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_party public.parties;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into v_party from public.parties where code = upper(trim(p_code)) for update;
  if not found then raise exception 'party not found'; end if;
  if exists (select 1 from public.party_members where party_id = v_party.id and user_id = auth.uid()) then
    return v_party.id;
  end if;
  if v_party.status <> 'gathering' then raise exception 'party already started'; end if;
  if (select count(*) from public.party_members where party_id = v_party.id) >= 8 then
    raise exception 'party is full (max 8)';
  end if;
  insert into public.party_members (party_id, user_id) values (v_party.id, auth.uid());
  return v_party.id;
end $$;

-- 날짜·시간대별 가능 인원수 (누가 가능한지는 반환하지 않음)
create function public.common_slots(p uuid) returns table (day date, slot text, n int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p) then raise exception 'not a member'; end if;
  return query
    select a.day, a.slot, count(*)::int from public.availabilities a
    where a.party_id = p group by a.day, a.slot
    order by count(*) desc, a.day, array_position(array['breakfast', 'lunch', 'dinner'], a.slot);
end $$;

-- 단계 완료 표시. 전원 완료면 다음 단계로 넘긴다.
-- 반환: 'gathering' | 'ready'(앱이 recommend 함수 호출) | 'voting' | 'closed'
create function public.set_done(p uuid, p_done boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_party public.parties;
  v_me public.party_members;
  v_total int;
  v_done int;
begin
  select * into v_party from public.parties where id = p for update;
  select * into v_me from public.party_members where party_id = p and user_id = auth.uid();
  if not found then raise exception 'not a member'; end if;

  if v_party.status = 'gathering' then
    if p_done and (v_me.lat is null or not exists (
        select 1 from public.availabilities where party_id = p and user_id = auth.uid())) then
      raise exception 'pin and at least one available date are required';
    end if;
    update public.party_members set input_done = p_done where party_id = p and user_id = auth.uid();
    select count(*), count(*) filter (where input_done) into v_total, v_done
      from public.party_members where party_id = p;
    if v_total < 2 or v_done < v_total then return 'gathering'; end if;

    -- 전원 완료: 날짜·시간대 확정 (전원 가능이 없으면 최다 인원)
    update public.parties set (final_date, final_slot) = (
      select c.day, c.slot from public.common_slots(p) c limit 1) where id = p;
    if v_party.fixed_mode = 'place' then
      update public.parties set status = 'closed', final_place_id = fixed_place_id where id = p;
      return 'closed';
    end if;
    return 'ready';

  elsif v_party.status = 'voting' then
    if p_done and not exists (
        select 1 from public.votes where party_id = p and round = v_party.round and user_id = auth.uid()) then
      raise exception 'vote first';
    end if;
    update public.party_members set vote_done = p_done where party_id = p and user_id = auth.uid();
    select count(*), count(*) filter (where vote_done) into v_total, v_done
      from public.party_members where party_id = p;
    if v_done < v_total then return 'voting'; end if;

    -- 전원 완료: 최다 득표, 동점이면 추천 점수(낮을수록 좋음) 순
    update public.parties set status = 'closed', final_place_id = (
      select c.place_id from public.candidates c
      left join public.votes v on v.party_id = c.party_id and v.round = c.round and v.place_id = c.place_id
      where c.party_id = p and c.round = v_party.round
      group by c.place_id, c.score order by count(v.user_id) desc, c.score limit 1)
    where id = p;
    return 'closed';
  end if;
  raise exception 'party is closed';
end $$;

-- 득표수: 전원 투표 완료 후에만, 개수만
create function public.vote_counts(p uuid) returns table (place_id int, n int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_party public.parties;
begin
  if not public.is_member(p) then raise exception 'not a member'; end if;
  select * into v_party from public.parties where id = p;
  if v_party.status <> 'closed' then raise exception 'voting not finished'; end if;
  return query
    select c.place_id, count(v.user_id)::int from public.candidates c
    left join public.votes v on v.party_id = c.party_id and v.round = c.round and v.place_id = c.place_id
    where c.party_id = p and c.round = v_party.round group by c.place_id;
end $$;

-- 확정 단계에서 방장이 재투표('voting') 또는 수집 복귀('gathering')
create function public.restart_party(p uuid, p_to text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_party public.parties;
begin
  select * into v_party from public.parties where id = p for update;
  if v_party.host_id is distinct from auth.uid() then raise exception 'host only'; end if;
  if v_party.status <> 'closed' then raise exception 'only after confirmation'; end if;
  if p_to = 'voting' and v_party.fixed_mode = 'place' then raise exception 'nothing to vote on'; end if;

  update public.party_members set input_done = (p_to = 'voting'), vote_done = false where party_id = p;
  if p_to = 'voting' then
    insert into public.candidates (party_id, round, place_id, score, max_min, avg_min)
      select party_id, round + 1, place_id, score, max_min, avg_min
      from public.candidates where party_id = p and round = v_party.round;
    update public.parties set round = round + 1, status = 'voting', final_place_id = null where id = p;
  elsif p_to = 'gathering' then
    update public.parties set round = round + 1, status = 'gathering',
      final_place_id = null, final_date = null, final_slot = null where id = p;
  else
    raise exception 'p_to must be voting or gathering';
  end if;
end $$;

-- 헬퍼 함수는 정책 내부용. 직접 호출은 막는다
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on all functions in schema public from anon;

-- 실시간: 완료 여부·이모지·파티 상태
alter publication supabase_realtime add table public.party_members, public.reactions, public.parties;
