-- 동네 고정 모드의 반경(km)을 방장이 고른다 (기본 1km)
alter table public.parties
  add column fixed_radius_km real not null default 1 check (fixed_radius_km between 0.3 and 10);

drop function public.create_party(text, text, int);
create function public.create_party(
  p_fixed_mode text default 'none', p_fixed_station_id text default null, p_fixed_place_id int default null,
  p_fixed_radius_km real default 1)
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
  insert into public.parties (code, host_id, fixed_mode, fixed_station_id, fixed_place_id, fixed_radius_km)
  values (v_code, auth.uid(), p_fixed_mode, p_fixed_station_id, p_fixed_place_id, p_fixed_radius_km)
  returning * into v_party;
  insert into public.party_members (party_id, user_id) values (v_party.id, auth.uid());
  return v_party;
end $$;

revoke execute on function public.create_party(text, text, int, real) from public, anon;
grant execute on function public.create_party(text, text, int, real) to authenticated;
