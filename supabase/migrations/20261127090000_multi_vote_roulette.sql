-- 1) 투표는 1인당 여러 곳 가능 (후보마다 한 표)
alter table public.votes drop constraint votes_pkey;
alter table public.votes add primary key (party_id, round, user_id, place_id);

-- 2) 전원 투표 완료 시 최다 득표. 동점이면 동점 후보 중 무작위 (앱이 룰렛으로 보여준다)
create or replace function public.set_done(p uuid, p_done boolean) returns text
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

    update public.parties set status = 'closed', final_place_id = (
      select c.place_id from public.candidates c
      left join public.votes v on v.party_id = c.party_id and v.round = c.round and v.place_id = c.place_id
      where c.party_id = p and c.round = v_party.round
      group by c.place_id order by count(v.user_id) desc, random() limit 1)
    where id = p;
    return 'closed';
  end if;
  raise exception 'party is closed';
end $$;

-- 3) 동점 룰렛 다시 돌리기: 방장만, 지금 결과를 뺀 동점 후보 중 무작위
create function public.respin(p uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_party public.parties;
  v_pick int;
begin
  select * into v_party from public.parties where id = p for update;
  if v_party.host_id is distinct from auth.uid() then raise exception 'host only'; end if;
  if v_party.status <> 'closed' or v_party.fixed_mode = 'place' then raise exception 'only after voting'; end if;

  with counts as (
    select c.place_id, count(v.user_id) n from public.candidates c
    left join public.votes v on v.party_id = c.party_id and v.round = c.round and v.place_id = c.place_id
    where c.party_id = p and c.round = v_party.round group by c.place_id)
  select place_id into v_pick from counts
  where n = (select max(n) from counts) and place_id <> v_party.final_place_id
  order by random() limit 1;
  if v_pick is null then raise exception 'no tie'; end if;

  update public.parties set final_place_id = v_pick where id = p;
  return v_pick;
end $$;

revoke execute on function public.respin(uuid) from public, anon;
grant execute on function public.respin(uuid) to authenticated;
