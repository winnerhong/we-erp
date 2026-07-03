-- =============================================================
-- 결산·마감(Period Close) — 사업자·월 단위로 회계기간을 잠근다.
--  마감된 기간의 거래(통장 등)는 생성·수정·삭제 불가. 조정은 익월로.
-- =============================================================
create table if not exists period_locks (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  period         text not null,                    -- 'YYYY-MM'
  locked_by      uuid references profiles(id) on delete set null,
  locked_by_name text,
  memo           text,
  created_at     timestamptz not null default now(),
  unique (company_id, period)
);
create index if not exists idx_period_locks_company on period_locks (company_id, period);

alter table period_locks enable row level security;
do $$ begin
  drop policy if exists period_locks_select on period_locks;
  create policy period_locks_select on period_locks for select using (auth.role() = 'authenticated');
end $$;
