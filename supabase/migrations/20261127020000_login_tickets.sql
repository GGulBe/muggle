-- 로그인 번호표: 안드로이드 Custom Tab이 앱 주소(exp://, muggle://)로 돌아가는 링크를 막아서,
-- 중간 페이지(docs/auth)가 토큰을 번호표에 맡기고 앱이 창을 닫은 뒤 찾아가는 방식.
-- 번호표 id는 gen_random_uuid(무작위 122bit)라 추측 불가. 10분 만료, 한 번 꺼내면 삭제.
create table public.login_tickets (
  id uuid primary key default gen_random_uuid(),
  access_token text,
  refresh_token text,
  created_at timestamptz not null default now()
);
alter table public.login_tickets enable row level security; -- 정책 없음: 아래 함수로만 접근

-- 앱(로그인 전, anon)이 번호표 발급
create function public.create_login_ticket() returns uuid
language sql security definer set search_path = '' as $$
  delete from public.login_tickets where created_at < now() - interval '10 minutes';
  insert into public.login_tickets default values returning id;
$$;

-- 중간 페이지가 방금 받은 토큰으로 호출. Authorization 헤더의 토큰과 같아야만 저장
create function public.fulfill_login_ticket(p_ticket uuid, p_access_token text, p_refresh_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null
     or current_setting('request.headers', true)::json->>'authorization' is distinct from 'Bearer ' || p_access_token then
    raise exception 'invalid token';
  end if;
  update public.login_tickets set access_token = p_access_token, refresh_token = p_refresh_token
  where id = p_ticket and access_token is null and created_at > now() - interval '10 minutes';
end $$;

-- 앱이 로그인 창을 닫은 뒤 토큰을 한 번만 꺼내 감
create function public.claim_login_ticket(p_ticket uuid) returns table (access_token text, refresh_token text)
language sql security definer set search_path = '' as $$
  delete from public.login_tickets t
  where t.id = p_ticket and t.access_token is not null and t.created_at > now() - interval '10 minutes'
  returning t.access_token, t.refresh_token;
$$;

revoke execute on function public.create_login_ticket(), public.claim_login_ticket(uuid),
  public.fulfill_login_ticket(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_login_ticket(), public.claim_login_ticket(uuid) to anon, authenticated;
grant execute on function public.fulfill_login_ticket(uuid, text, text) to authenticated;
