-- 방장: 파티 삭제 (멤버·입력·후보·표·반응까지 cascade로 함께 삭제, 리뷰는 남고 party_id만 비움)
create function public.delete_party(p uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.parties where id = p and host_id = auth.uid();
  if not found then raise exception 'host only'; end if;
end $$;

-- 멤버: 파티 나가기. 투표가 시작되면 결과가 틀어지므로 수집 단계에서만. 방장은 나가지 않고 삭제한다
create function public.leave_party(p uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_party public.parties;
begin
  select * into v_party from public.parties where id = p for update;
  if v_party.host_id = auth.uid() then raise exception 'host cannot leave'; end if;
  if v_party.status <> 'gathering' then raise exception 'party already started'; end if;
  delete from public.party_members where party_id = p and user_id = auth.uid();
  if not found then raise exception 'not a member'; end if;
end $$;

revoke execute on function public.delete_party(uuid), public.leave_party(uuid) from public, anon;
grant execute on function public.delete_party(uuid), public.leave_party(uuid) to authenticated;
