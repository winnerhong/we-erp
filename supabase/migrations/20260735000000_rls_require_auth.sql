-- =============================================================
-- B-3b 보정 — user_can_access_company 가 미인증(auth.uid() null)도 통과시키던 문제 수정.
--   공개 anon 키로 미인증 상태에서 데이터를 읽을 수 있던 회귀를 차단.
--   (이전 정책은 auth.role()='authenticated' 로 anon 을 막았음)
-- =============================================================
create or replace function user_can_access_company(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      cid is null
      or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN')
      or not exists (select 1 from user_companies uc where uc.user_id = auth.uid())
      or exists (select 1 from user_companies uc where uc.user_id = auth.uid() and uc.company_id = cid)
    );
$$;
