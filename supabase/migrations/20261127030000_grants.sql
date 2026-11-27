-- 최근 Supabase 프로젝트는 새 테이블·함수에 anon/authenticated 권한을 기본으로 주지 않는다.
-- 앱(로그인 사용자)에게 필요한 만큼만 명시적으로 준다. 행 단위 공개 범위는 여전히 RLS가 정한다.

grant select on public.profiles, public.stations, public.station_edges, public.categories, public.places,
  public.parties, public.party_members, public.candidates to authenticated;
grant update (nickname, avatar_url) on public.profiles to authenticated;
grant update (lat, lng, has_car) on public.party_members to authenticated;

grant select, insert, delete on public.availabilities, public.preferences, public.reactions, public.reviews
  to authenticated;
grant select, insert, update (place_id), delete on public.votes to authenticated;
grant usage on sequence public.reviews_id_seq to authenticated;

-- RLS 정책 안에서 호출되는 헬퍼는 호출자 권한으로 실행 가능해야 한다
grant execute on function public.is_member(uuid), public.can_edit_input(uuid), public.can_vote(uuid, int)
  to authenticated;
grant execute on function public.create_party(text, text, int), public.join_party(text), public.common_slots(uuid),
  public.set_done(uuid, boolean), public.vote_counts(uuid), public.restart_party(uuid, text) to authenticated;
