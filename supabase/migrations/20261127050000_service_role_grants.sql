-- 추천 Edge Function은 서버 키(service_role)로 전원의 입력을 읽고 후보를 쓴다.
-- 이 프로젝트는 service_role에도 기본 권한을 주지 않으므로 함수에 필요한 만큼만 준다.
grant select on public.parties, public.party_members, public.preferences, public.stations,
  public.station_edges, public.places, public.reviews to service_role;
grant select, insert, update on public.candidates to service_role;
grant update (status) on public.parties to service_role;
