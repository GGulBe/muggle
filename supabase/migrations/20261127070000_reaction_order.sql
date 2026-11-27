-- 이모지 반응을 단 순서대로 보여주기 위한 시각
alter table public.reactions add column created_at timestamptz not null default now();
