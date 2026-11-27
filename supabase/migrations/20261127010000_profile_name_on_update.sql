-- Supabase는 OAuth 가입 시 auth.users를 먼저 만들고 메타데이터를 나중에 채운다.
-- 그래서 insert 트리거만으로는 닉네임이 비어 있을 수 있어, 메타데이터가 채워질 때도 반영한다.
create function public.sync_profile_from_meta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set
    nickname = coalesce(nullif(nickname, ''),
                        nullif(new.raw_user_meta_data->>'name', ''),
                        nullif(new.raw_user_meta_data->>'user_name', ''), ''),
    avatar_url = coalesce(avatar_url, new.raw_user_meta_data->>'avatar_url')
  where id = new.id;
  return new;
end $$;

create trigger on_auth_user_meta_updated after update of raw_user_meta_data on auth.users
for each row execute function public.sync_profile_from_meta();

revoke execute on function public.sync_profile_from_meta() from public, anon, authenticated;

-- 이미 가입한 사용자 보정
update public.profiles p set
  nickname = coalesce(nullif(p.nickname, ''), nullif(u.raw_user_meta_data->>'name', ''), ''),
  avatar_url = coalesce(p.avatar_url, u.raw_user_meta_data->>'avatar_url')
from auth.users u where u.id = p.id;
