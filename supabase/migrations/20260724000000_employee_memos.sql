-- =============================================================
-- 직원 메모 로그 — 덮어쓰기 대신 타임스탬프·작성자와 함께 계속 누적.
-- =============================================================
create table if not exists employee_memos (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  body        text not null,
  author_id   uuid references profiles(id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_employee_memos_emp on employee_memos (employee_id, created_at);

alter table employee_memos enable row level security;
do $$ begin
  drop policy if exists employee_memos_select on employee_memos;
  create policy employee_memos_select on employee_memos for select using (auth.role() = 'authenticated');
end $$;
