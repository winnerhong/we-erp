-- =============================================================
-- 3차 모듈6 — 행사 관리(투입 인력 배정)
--   체육행사 계약(contracts type=EVENT)에 투입 인력(강사·진행요원)을 역할과 함께 배정.
--   행사 진행상태는 contracts.status(DRAFT=준비/ACTIVE=진행/ENDED=완료) 재사용.
-- =============================================================
create table if not exists event_staff (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  role        text,                              -- 메인강사/보조/진행/안전 등
  memo        text,
  created_at  timestamptz not null default now(),
  unique (contract_id, employee_id)
);
create index if not exists idx_event_staff_contract on event_staff (contract_id);

alter table event_staff enable row level security;
do $$ begin
  drop policy if exists event_staff_select on event_staff;
  create policy event_staff_select on event_staff for select using (auth.role() = 'authenticated');
end $$;
