-- 약속 후 후기: 확정된 파티의 멤버만, 확정 장소에 대해서만, 파티당 1개 (수정은 지우고 다시 쓰기)
create unique index reviews_one_per_party on public.reviews (user_id, party_id) where party_id is not null;

drop policy "write" on public.reviews;
create policy "write" on public.reviews for insert to authenticated with check (
  user_id = auth.uid() and party_id is not null and public.is_member(party_id)
  and exists (select 1 from public.parties pa
              where pa.id = party_id and pa.status = 'closed' and pa.final_place_id = place_id));
