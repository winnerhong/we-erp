-- =============================================================
-- 회사-사용자-역할 (N:M:N) — 사용자가 접근 가능한 사업자 + 회사별 역할.
--  비관리자는 배정된 사업자만 보고 다룬다. (배정 0건이면 하위호환으로 전체 허용)
--  ADMIN 은 배정과 무관하게 전 사업자 슈퍼관리자.
-- =============================================================
create table if not exists user_companies (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role       text,                              -- 회사별 역할(선택; null=프로필 전역 역할)
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);
create index if not exists idx_user_companies_user on user_companies (user_id);
create index if not exists idx_user_companies_company on user_companies (company_id);

alter table user_companies enable row level security;
do $$ begin
  drop policy if exists user_companies_select on user_companies;
  create policy user_companies_select on user_companies for select using (auth.role() = 'authenticated');
end $$;
